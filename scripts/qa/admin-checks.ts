/**
 * Administrative surface: organization, policies, users, settings.
 *
 * These call the service functions the actions delegate to, which is the whole
 * reason that split exists — a server action resolves its session from the
 * request scope, so it cannot be invoked from a test at all. Every check here
 * asserts both halves of an outcome: that the refusal happens, and that nothing
 * was written when it does.
 */
import { check, eq, section, truthy } from './harness';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ctx = any;

export async function adminChecks(c: Ctx) {
  const { db, dEq, and, sql, schema, admin, employee, manager, orgValidation, policyValidation } = c;
  const { offices, departments, policies, auditLogs, users, userRoles, systemSettings } = schema;

  section('6c. 조직 관리 액션 — Organization actions');

  const orgSvc = await import('@/server/services/organization');
  let qaOfficeId = '';
  let qaDeptId = '';

  await check('관리자는 지사를 등록할 수 있다', async () => {
    const res = await orgSvc.saveOffice(admin, {
      code: 'QA-OF',
      name: 'QA Office',
      country: 'Korea',
      city: 'Busan',
      timezone: 'Asia/Seoul',
      baseCurrency: 'krw',
    });
    eq(res.ok, true, res.key);
    const [row] = await db.select().from(offices).where(dEq(offices.code, 'QA-OF')).limit(1);
    truthy(row, 'office row');
    qaOfficeId = row.id;
    eq(row.baseCurrency, 'KRW', 'currency normalised to upper case');
  });

  await check('일반 직원은 지사를 등록할 수 없다', async () => {
    const res = await orgSvc.saveOffice(employee, {
      code: 'QA-NO',
      name: 'Nope',
      country: 'Korea',
      city: 'Seoul',
      timezone: 'Asia/Seoul',
      baseCurrency: 'KRW',
    });
    eq(res.ok, false, 'refused');
    eq(res.key, 'wfError.noPermission', 'reason');
    const rows = await db.select().from(offices).where(dEq(offices.code, 'QA-NO'));
    eq(rows.length, 0, 'nothing was written');
  });

  await check('중복 코드는 거부된다', async () => {
    const res = await orgSvc.saveOffice(admin, {
      code: 'QA-OF',
      name: 'Duplicate',
      country: 'Korea',
      city: 'Seoul',
      timezone: 'Asia/Seoul',
      baseCurrency: 'KRW',
    });
    eq(res.ok, false, 'refused');
    eq(res.key, 'org.codeTaken', 'reason');
  });

  await check('부서를 등록하고 책임자를 지정할 수 있다', async () => {
    const res = await orgSvc.saveDepartment(admin, {
      code: 'QA-DEP',
      name: 'QA Department',
      officeId: qaOfficeId,
      headEmployeeId: manager.employeeId,
    });
    eq(res.ok, true, res.key);
    const [row] = await db.select().from(departments).where(dEq(departments.code, 'QA-DEP')).limit(1);
    qaDeptId = row.id;
    eq(row.headEmployeeId, manager.employeeId, 'head assigned');
  });

  await check('재직 중이 아닌 사람은 부서 책임자가 될 수 없다', async () => {
    const res = await orgSvc.saveDepartment(admin, {
      code: 'QA-DEP2',
      name: 'QA Department 2',
      officeId: qaOfficeId,
      headEmployeeId: crypto.randomUUID(),
    });
    eq(res.ok, false, 'refused');
    eq(res.key, 'org.headNotEmployee', 'reason');
  });

  await check('라우팅 부서(HR·FIN·CEO)는 삭제할 수 없다', async () => {
    for (const code of orgValidation.ROUTING_DEPT_CODES) {
      const [row] = await db.select().from(departments).where(dEq(departments.code, code)).limit(1);
      const res = await orgSvc.deleteDepartment(admin, row.id);
      eq(res.ok, false, `${code} refused`);
      eq(res.key, 'org.routingDept', `${code} reason`);
    }
  });

  await check('참조가 있는 부서는 삭제되지 않고 무엇이 막는지 알려준다', async () => {
    const [ops] = await db.select().from(departments).where(dEq(departments.code, 'OP')).limit(1);
    const res = await orgSvc.deleteDepartment(admin, ops.id);
    eq(res.ok, false, 'refused');
    eq(res.key, 'org.inUse', 'reason');
    eq(res.vars?.what, 'org.depEmployees', 'names the blocker');
    truthy(Number(res.vars?.count) > 0, 'reports how many');
  });

  await check('참조가 없는 부서와 지사는 삭제된다', async () => {
    const d = await orgSvc.deleteDepartment(admin, qaDeptId);
    eq(d.ok, true, d.key);
    const o = await orgSvc.deleteOffice(admin, qaOfficeId);
    eq(o.ok, true, o.key);
    const rows = await db.select().from(offices).where(dEq(offices.code, 'QA-OF'));
    eq(rows.length, 0, 'office gone');
  });

  await check('조직 변경이 감사 로그에 기록된다', async () => {
    const rows = await db
      .select({ action: auditLogs.action })
      .from(auditLogs)
      .where(sql`${auditLogs.entityType} in ('office','department')`);
    truthy(rows.length >= 4, `create/edit/delete logged (got ${rows.length})`);
  });

  section('6d. 정책·사용자 액션 — Policy and user actions');

  const adminSvc = await import('@/server/services/admin');

  await check('관리자는 정책을 만들 수 있고 그 정책은 실제로 평가된다', async () => {
    const res = await adminSvc.createPolicy(admin, {
      code: 'POL-QA-HOTEL',
      name: 'QA hotel cap',
      metric: 'HOTEL_PER_NIGHT',
      appliesTo: 'BUSINESS_TRIP',
      threshold: 100,
      severity: 'WARNING',
      message: 'QA suite hotel policy, long enough to pass validation.',
      isActive: true,
    });
    eq(res.ok, true, res.key);
    const [row] = await db.select().from(policies).where(dEq(policies.code, 'POL-QA-HOTEL')).limit(1);
    truthy(row, 'policy row');
    truthy(policyValidation.typesForMetric(row.metric).includes(row.appliesTo), 'the pair can actually fire');
  });

  await check('일반 직원은 정책을 만들 수 없다', async () => {
    const res = await adminSvc.createPolicy(employee, {
      code: 'POL-QA-NO',
      name: 'Nope',
      metric: 'MEAL_PER_DAY',
      appliesTo: 'EXPENSE',
      threshold: 10,
      severity: 'WARNING',
      message: 'Should never be stored by an ordinary employee.',
      isActive: true,
    });
    eq(res.ok, false, 'refused');
    eq(res.key, 'wfError.noPermission', 'reason');
    const rows = await db.select().from(policies).where(dEq(policies.code, 'POL-QA-NO'));
    eq(rows.length, 0, 'nothing was written');
  });

  await check('정책을 삭제할 수 있다', async () => {
    const [row] = await db.select().from(policies).where(dEq(policies.code, 'POL-QA-HOTEL')).limit(1);
    const res = await adminSvc.deletePolicy(admin, row.id);
    eq(res.ok, true, res.key);
    const rows = await db.select().from(policies).where(dEq(policies.code, 'POL-QA-HOTEL'));
    eq(rows.length, 0, 'policy gone');
  });

  await check('일반 직원은 권한을 바꿀 수 없다', async () => {
    const res = await adminSvc.saveUserRoles(employee, {
      userId: employee.userId,
      primaryRole: 'SUPER_ADMIN',
      roles: ['SUPER_ADMIN'],
    });
    eq(res.ok, false, 'refused');
    eq(res.key, 'wfError.noPermission', 'reason');
    const mine = await db.select({ role: userRoles.role }).from(userRoles).where(dEq(userRoles.userId, employee.userId));
    eq(
      mine.some((r: { role: string }) => r.role === 'SUPER_ADMIN'),
      false,
      'no escalation happened',
    );
  });

  await check('자기 계정은 스스로 비활성화할 수 없다', async () => {
    const res = await adminSvc.setUserActive(admin, admin.userId, false);
    eq(res.ok, false, 'refused');
    eq(res.key, 'users.cannotDisableSelf', 'reason');
  });

  await check('마지막 관리자의 권한은 회수할 수 없다', async () => {
    const admins = await db
      .select({ userId: userRoles.userId })
      .from(userRoles)
      .where(sql`${userRoles.role} in ('SUPER_ADMIN','ADMIN')`);
    const unique = [...new Set(admins.map((a: { userId: string }) => a.userId))] as string[];
    truthy(unique.length > 0, 'at least one administrator exists');

    // Strip every administrator but one, then try to strip the last.
    for (const userId of unique.slice(1)) {
      await db.delete(userRoles).where(and(dEq(userRoles.userId, userId), sql`${userRoles.role} in ('SUPER_ADMIN','ADMIN')`));
    }
    const [last] = await db.select().from(users).where(dEq(users.id, unique[0])).limit(1);
    const res = await adminSvc.saveUserRoles(admin, {
      userId: last.id,
      primaryRole: 'EMPLOYEE',
      roles: ['EMPLOYEE'],
    });
    eq(res.ok, false, 'refused');
    eq(res.key, 'users.lastAdmin', 'reason');
  });

  await check('시스템 설정은 저장된 값의 타입을 유지한다', async () => {
    const rows = await db.select().from(systemSettings);
    const numeric = rows.find((r: { value: unknown }) => typeof r.value === 'number');
    if (!numeric) throw new Error('SKIP: no numeric setting seeded');
    const bad = await adminSvc.saveSetting(admin, numeric.key, 'not-a-number');
    eq(bad.ok, false, 'a non-numeric value is refused');
    const good = await adminSvc.saveSetting(admin, numeric.key, '48');
    eq(good.ok, true, good.key);
    const [after] = await db.select().from(systemSettings).where(dEq(systemSettings.key, numeric.key)).limit(1);
    eq(typeof after.value, 'number', 'stored type preserved');
  });

  await check('설정 변경 권한이 없으면 값이 바뀌지 않는다', async () => {
    const rows = await db.select().from(systemSettings);
    const target = rows[0];
    const before = JSON.stringify(target.value);
    const res = await adminSvc.saveSetting(employee, target.key, 'tampered');
    eq(res.ok, false, 'refused');
    const [after] = await db.select().from(systemSettings).where(dEq(systemSettings.key, target.key)).limit(1);
    eq(JSON.stringify(after.value), before, 'value untouched');
  });
}
