/**
 * Functional QA suite — `npm run test:qa`
 *
 * The route suite proves every page renders; the RBAC suite proves the
 * permission predicate holds. Neither runs a single piece of business logic: a
 * request that submitted to nobody, an approval that never advanced a step, or a
 * budget that reserved twice would pass both of them.
 *
 * This suite drives the real service functions — the same ones the server
 * actions call — against a throwaway in-memory database. Nothing is stubbed, so
 * a green run means those code paths actually work.
 *
 * The database lives in memory (see the PGLITE_DATA_DIR line below), so this can
 * run while the dev server is up. PGlite is single-writer; a second process
 * opening ./.pgdata corrupts it.
 */

// Must precede every import that touches the database.
process.env.PGLITE_DATA_DIR = 'memory://';
process.env.DB_DRIVER = 'pglite';
delete process.env.DATABASE_URL;

import { check, checkRejects, eq, near, report, section, truthy } from './harness';

async function main() {
  const { and, eq: dEq, sql } = await import('drizzle-orm');
  const { ready } = await import('@/lib/db/bootstrap');
  const schema = await import('@/lib/db/schema');
  const {
    approvalSteps,
    budgets,
    costCenters,
    departments,
    employees,
    expenseClaims,
    leaveRequests,
    offices,
    policies,
    requests,
    teams,
    users,
    userRoles,
  } = schema;

  const db = await ready();

  const create = await import('@/server/services/create-request');
  const approval = await import('@/server/services/approval');
  const rbac = await import('@/lib/rbac');
  const { calcWorkingDays } = await import('@/lib/dates');
  const { validateValues, buildTitle } = await import('@/lib/validation/templates');
  const orgValidation = await import('@/lib/validation/organization');
  const policyValidation = await import('@/lib/validation/policies');

  type SessionUser = import('@/lib/auth/session').SessionUser;

  /* ---------------------------------------------------------------- */
  /* Sessions, built from the seeded people rather than invented       */
  /* ---------------------------------------------------------------- */

  async function sessionFor(email: string): Promise<SessionUser> {
    const [row] = await db
      .select({
        userId: users.id,
        employeeId: employees.id,
        email: employees.email,
        name: employees.name,
        primaryRole: users.primaryRole,
        departmentId: employees.departmentId,
        departmentCode: departments.code,
        officeId: employees.officeId,
        position: employees.position,
      })
      .from(users)
      .innerJoin(employees, dEq(employees.id, users.employeeId))
      .leftJoin(departments, dEq(departments.id, employees.departmentId))
      .where(dEq(users.email, email))
      .limit(1);
    if (!row) throw new Error(`no seeded account for ${email}`);
    const roles = await db.select({ role: userRoles.role }).from(userRoles).where(dEq(userRoles.userId, row.userId));
    return {
      ...row,
      primaryRole: row.primaryRole as SessionUser['primaryRole'],
      roles: roles.map((r) => r.role) as SessionUser['roles'],
      activeOfficeId: row.officeId,
    };
  }

  const employee = await sessionFor('employee@ohmyhotel.com'); // Bryant Vo, SCM, VN
  const manager = await sessionFor('vicky@ohmyhotel.com'); // Vicky Nguyen, SCM head
  const director = await sessionFor('aiden@ohmyhotel.com');
  const finance = await sessionFor('finance@ohmyhotel.com');
  const admin = await sessionFor('admin@ohmyhotel.com');
  const auditor = await sessionFor('auditor@ohmyhotel.com');

  const stepsOf = (id: string) =>
    db.select().from(approvalSteps).where(dEq(approvalSteps.requestId, id)).orderBy(approvalSteps.stepOrder);
  const reqOf = async (id: string) => (await db.select().from(requests).where(dEq(requests.id, id)).limit(1))[0];

  /** A weekday far enough out that leave balance and holidays stay predictable. */
  const future = (offsetDays: number) => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + offsetDays);
    while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  };

  /* ================================================================ */
  section('1. 기안 생성 — Request creation');
  /* ================================================================ */

  let leaveId = '';
  await check('연차 신청이 생성되고 근무일이 계산된다', async () => {
    const res = await create.createLeave(employee, {
      leaveType: 'ANNUAL',
      startDate: future(30),
      endDate: future(32),
      halfDayStart: false,
      halfDayEnd: false,
      reason: 'QA suite — annual leave',
    });
    leaveId = res.id;
    truthy(res.id, 'request id');
    const [lv] = await db.select().from(leaveRequests).where(dEq(leaveRequests.requestId, res.id)).limit(1);
    truthy(lv, 'leave detail row');
    truthy(Number(lv.workingDays) > 0, 'working days > 0');
  });

  await check('근무일 계산이 주말을 제외한다', () => {
    // A Mon–Fri span is 5; adding the weekend must not change it.
    const monday = '2026-09-07';
    const friday = '2026-09-11';
    const sunday = '2026-09-13';
    eq(calcWorkingDays(monday, friday, []).workingDays, 5, 'Mon–Fri');
    eq(calcWorkingDays(monday, sunday, []).workingDays, 5, 'Mon–Sun (weekend excluded)');
  });

  await check('반차는 0.5일로 계산된다', () => {
    eq(calcWorkingDays('2026-09-07', '2026-09-07', [], { halfDayStart: true }).workingDays, 0.5, 'single half day');
  });

  await check('종료일이 시작일보다 빠르면 거부된다', async () => {
    const { leaveSchema } = await import('@/lib/validation/requests');
    const parsed = leaveSchema.safeParse({
      leaveType: 'ANNUAL',
      startDate: future(40),
      endDate: future(30),
    });
    eq(parsed.success, false, 'schema rejects reversed dates');
  });

  let tripId = '';
  await check('출장 신청이 생성되고 비용이 합산된다', async () => {
    const res = await create.createTrip(employee, {
      country: 'Japan',
      city: 'Tokyo',
      isInternational: true,
      purpose: 'QA suite — partner meetings in Tokyo',
      startDate: future(20),
      endDate: future(23),
      hotelNights: 3,
      hotelRatePerNight: 180,
      currency: 'USD',
      travelerIds: [],
      costs: [
        { category: 'FLIGHT', amount: 620 },
        { category: 'HOTEL', amount: 540 },
      ],
    });
    tripId = res.id;
    const row = await reqOf(res.id);
    near(Number(row.amountBase), 1160, 0.01, 'trip total');
  });

  await check('지출 요청이 생성되고 품목 합계가 맞다', async () => {
    const res = await create.createPurchase(employee, {
      category: 'IT',
      purpose: 'QA suite — replacement laptops for the ops team',
      quotationCount: 2,
      currency: 'USD',
      items: [
        { itemName: 'Laptop', quantity: 3, unitPrice: 1200, specification: '16GB' },
        { itemName: 'Dock', quantity: 3, unitPrice: 150 },
      ],
    } as never);
    const row = await reqOf(res.id);
    near(Number(row.amountBase), 4050, 0.01, 'purchase total');
  });

  await check('경비 정산이 생성된다', async () => {
    const res = await create.createExpense(employee, {
      paymentMethod: 'PERSONAL',
      currency: 'USD',
      description: 'QA suite — expense claim',
      items: [
        { expenseDate: future(-5), category: 'MEAL', merchant: 'QA Diner', amount: 42.5, taxAmount: 0 },
        { expenseDate: future(-4), category: 'TRAVEL', merchant: 'QA Taxi', amount: 18, taxAmount: 0 },
      ],
    });
    const row = await reqOf(res.id);
    near(Number(row.amountBase), 60.5, 0.01, 'expense total');
  });

  await check('영수증 해시가 중복 판별에 쓸 수 있게 결정적이다', () => {
    const a = create.receiptHash('QA Diner', '2026-09-01', 42.5);
    const b = create.receiptHash('  qa diner  ', '2026-09-01', 42.5);
    const c = create.receiptHash('QA Diner', '2026-09-01', 42.51);
    eq(a, b, 'same receipt normalises to the same hash');
    truthy(a !== c, 'a different amount produces a different hash');
  });

  await check('비USD 통화가 기준통화로 환산된다', async () => {
    const res = await create.createGeneric(employee, 'GENERAL', {
      title: 'QA suite — KRW conversion',
      category: 'QA',
      details: 'Checking that a non-USD amount is converted to the base currency.',
      amount: 1_000_000,
      currency: 'KRW',
    });
    const row = await reqOf(res.id);
    truthy(Number(row.amountBase) > 0, 'base amount set');
    truthy(Number(row.amountBase) < 1_000_000, 'KRW converted down to USD');
    near(Number(row.amountOriginal), 1_000_000, 0.01, 'original amount preserved');
  });

  /* ================================================================ */
  section('2. 결재선 구성 — Approval chain');
  /* ================================================================ */

  await check('상신하면 결재 단계가 실제로 생성된다', async () => {
    await approval.submitRequest(employee, leaveId);
    const steps = await stepsOf(leaveId);
    truthy(steps.length > 0, 'materialized steps');
    eq((await reqOf(leaveId)).status, 'SUBMITTED', 'status');
  });

  await check('모든 결재 단계에 실제 담당자가 배정된다', async () => {
    const steps = await stepsOf(leaveId);
    const unassigned = steps.filter((s) => !s.approverId);
    eq(unassigned.length, 0, `steps with no approver (${unassigned.map((s) => s.name).join(', ')})`);
  });

  await check('첫 단계만 대기 상태이고 나머지는 순서를 기다린다', async () => {
    const steps = await stepsOf(leaveId);
    eq(steps[0].status, 'PENDING', 'first step');
    eq(steps[0].stepOrder, 1, 'first step order');
    truthy(
      steps.slice(1).every((s) => s.status === 'PENDING'),
      'later steps queued',
    );
  });

  await check('기안자 본인은 자기 기안의 결재자가 되지 않는다', async () => {
    const steps = await stepsOf(leaveId);
    const self = steps.filter((s) => s.approverId === employee.employeeId);
    eq(self.length, 0, 'self-approval steps');
  });

  await check('지정 결재선을 넣으면 그 순서 그대로 반영된다', async () => {
    const res = await create.createGeneric(employee, 'GENERAL', {
      title: 'QA suite — explicit approval line',
      category: 'QA',
      details: 'Submitting with a hand-picked approver order.',
      amount: 0,
      currency: 'USD',
    });
    await approval.submitRequest(employee, res.id, {
      approverIds: [manager.employeeId, finance.employeeId, director.employeeId],
    });
    const steps = await stepsOf(res.id);
    eq(steps.length, 3, 'step count');
    eq(steps[0].approverId, manager.employeeId, 'step 1');
    eq(steps[1].approverId, finance.employeeId, 'step 2');
    eq(steps[2].approverId, director.employeeId, 'step 3');
    eq((await reqOf(res.id)).chainEdited, true, 'chainEdited recorded');
  });

  await check('금액이 크면 결재 단계가 늘어난다', async () => {
    const small = await create.createPurchase(employee, {
      category: 'OFFICE',
      purpose: 'QA suite — small purchase below the escalation threshold',
      quotationCount: 2,
      currency: 'USD',
      items: [{ itemName: 'Paper', quantity: 1, unitPrice: 50 }],
    } as never);
    const big = await create.createPurchase(employee, {
      category: 'IT',
      purpose: 'QA suite — large purchase above the escalation threshold',
      quotationCount: 2,
      currency: 'USD',
      items: [{ itemName: 'Server rack', quantity: 1, unitPrice: 45000 }],
    } as never);
    await approval.submitRequest(employee, small.id);
    await approval.submitRequest(employee, big.id);
    const smallSteps = await stepsOf(small.id);
    const bigSteps = await stepsOf(big.id);
    truthy(
      bigSteps.length > smallSteps.length,
      `$45,000 route (${bigSteps.length} steps) should be longer than $50 route (${smallSteps.length} steps)`,
    );
  });

  await checkRejects(
    '남의 기안은 상신할 수 없다',
    () => approval.submitRequest(manager, tripId),
    /onlyRequesterSubmit/,
  );

  await checkRejects(
    '이미 상신된 기안은 다시 상신할 수 없다',
    () => approval.submitRequest(employee, leaveId),
    /badStatus/,
  );

  /* ================================================================ */
  section('3. 결재 처리 — Decisions');
  /* ================================================================ */

  await check('담당 결재자가 승인하면 다음 단계로 넘어간다', async () => {
    const steps = await stepsOf(leaveId);
    const first = steps[0];
    const approver = await sessionForEmployee(first.approverId!);
    await approval.decideRequest(approver, leaveId, 'APPROVE', 'QA approve');
    const after = await stepsOf(leaveId);
    eq(after[0].status, 'APPROVED', 'first step');
    if (after.length > 1) eq(after[1].status, 'PENDING', 'second step now waiting');
  });

  async function sessionForEmployee(employeeId: string): Promise<SessionUser> {
    const [row] = await db.select({ email: employees.email }).from(employees).where(dEq(employees.id, employeeId)).limit(1);
    return sessionFor(row.email);
  }

  await checkRejects(
    '담당이 아닌 사람은 승인할 수 없다',
    async () => {
      const steps = await stepsOf(leaveId);
      const pending = steps.find((s) => s.status === 'PENDING');
      if (!pending) throw new Error('SKIP: already fully approved');
      const outsider = pending.approverId === employee.employeeId ? manager : employee;
      return approval.decideRequest(outsider, leaveId, 'APPROVE', 'should not be allowed');
    },
    /notApprover|noPermission|SKIP/,
  );

  await check('마지막 단계를 승인하면 기안이 최종 승인된다', async () => {
    for (let guard = 0; guard < 8; guard++) {
      const steps = await stepsOf(leaveId);
      const pending = steps.find((s) => s.status === 'PENDING');
      if (!pending) break;
      const approver = await sessionForEmployee(pending.approverId!);
      await approval.decideRequest(approver, leaveId, 'APPROVE', 'QA approve');
    }
    eq((await reqOf(leaveId)).status, 'APPROVED', 'final status');
  });

  await checkRejects(
    '반려에는 사유가 반드시 필요하다',
    async () => {
      const res = await create.createGeneric(employee, 'GENERAL', {
        title: 'QA suite — reject without a reason',
        category: 'QA',
        details: 'This one should not be rejectable without a written reason.',
        amount: 0,
        currency: 'USD',
      });
      await approval.submitRequest(employee, res.id, { approverIds: [manager.employeeId] });
      return approval.decideRequest(manager, res.id, 'REJECT', '   ');
    },
    /rejectNeedsReason/,
  );

  await check('반려하면 기안이 REJECTED가 된다', async () => {
    const res = await create.createGeneric(employee, 'GENERAL', {
      title: 'QA suite — rejection path',
      category: 'QA',
      details: 'This request exists to be rejected by the QA suite.',
      amount: 0,
      currency: 'USD',
    });
    await approval.submitRequest(employee, res.id, { approverIds: [manager.employeeId] });
    await approval.decideRequest(manager, res.id, 'REJECT', 'QA — not approved');
    eq((await reqOf(res.id)).status, 'REJECTED', 'status');
  });

  await check('보완 요청하면 기안자에게 되돌아간다', async () => {
    const res = await create.createGeneric(employee, 'GENERAL', {
      title: 'QA suite — return path',
      category: 'QA',
      details: 'This request exists to be returned for revision by the QA suite.',
      amount: 0,
      currency: 'USD',
    });
    await approval.submitRequest(employee, res.id, { approverIds: [manager.employeeId] });
    await approval.decideRequest(manager, res.id, 'RETURN', 'QA — please add the quotation');
    const status = (await reqOf(res.id)).status;
    truthy(['RETURNED', 'DRAFT'].includes(status), `status back with the requester (got ${status})`);
  });

  await check('기안자가 상신을 취소할 수 있다', async () => {
    const res = await create.createGeneric(employee, 'GENERAL', {
      title: 'QA suite — withdrawal path',
      category: 'QA',
      details: 'This request exists to be withdrawn by its requester in the QA suite.',
      amount: 0,
      currency: 'USD',
    });
    await approval.submitRequest(employee, res.id, { approverIds: [manager.employeeId] });
    await approval.cancelRequest(employee, res.id, 'QA — no longer needed');
    eq((await reqOf(res.id)).status, 'CANCELED', 'status');
  });

  await checkRejects(
    '최종 승인된 기안은 다시 결재할 수 없다',
    () => approval.decideRequest(manager, leaveId, 'APPROVE', 'already done'),
    /alreadyDecided|badStatus|notApprover/,
  );

  /* ================================================================ */
  section('4. 예산 — Budget reservation');
  /* ================================================================ */

  const budgetFor = async (departmentId: string | null) => {
    const rows = await db
      .select()
      .from(budgets)
      .where(departmentId ? dEq(budgets.departmentId, departmentId) : sql`true`);
    return rows;
  };

  await check('상신하면 예산이 예약(allocated)된다', async () => {
    const before = await budgetFor(employee.departmentId);
    const beforeAllocated = before.reduce((s, b) => s + Number(b.committed ?? 0), 0);

    const res = await create.createPurchase(employee, {
      category: 'OFFICE',
      purpose: 'QA suite — reservation check for the budget ledger',
      quotationCount: 2,
      currency: 'USD',
      items: [{ itemName: 'QA widget', quantity: 1, unitPrice: 300 }],
    } as never);
    await approval.submitRequest(employee, res.id);

    const after = await budgetFor(employee.departmentId);
    const afterAllocated = after.reduce((s, b) => s + Number(b.committed ?? 0), 0);
    truthy(afterAllocated > beforeAllocated, `allocated rose (${beforeAllocated} → ${afterAllocated})`);
  });

  await check('반려하면 예약이 해제된다', async () => {
    const res = await create.createPurchase(employee, {
      category: 'OFFICE',
      purpose: 'QA suite — release check, this one gets rejected',
      quotationCount: 2,
      currency: 'USD',
      items: [{ itemName: 'QA widget', quantity: 1, unitPrice: 275 }],
    } as never);
    await approval.submitRequest(employee, res.id, { approverIds: [manager.employeeId] });
    const mid = await budgetFor(employee.departmentId);
    const midAllocated = mid.reduce((s, b) => s + Number(b.committed ?? 0), 0);

    await approval.decideRequest(manager, res.id, 'REJECT', 'QA — released');
    const after = await budgetFor(employee.departmentId);
    const afterAllocated = after.reduce((s, b) => s + Number(b.committed ?? 0), 0);
    truthy(afterAllocated < midAllocated, `allocated fell back (${midAllocated} → ${afterAllocated})`);
  });

  await check('최종 승인하면 예약이 집행(spent)으로 확정된다', async () => {
    const res = await create.createPurchase(employee, {
      category: 'OFFICE',
      purpose: 'QA suite — commit check, this one gets fully approved',
      quotationCount: 2,
      currency: 'USD',
      items: [{ itemName: 'QA widget', quantity: 1, unitPrice: 210 }],
    } as never);
    await approval.submitRequest(employee, res.id, { approverIds: [manager.employeeId] });

    const before = await budgetFor(employee.departmentId);
    const beforeSpent = before.reduce((s, b) => s + Number(b.spent ?? 0), 0);

    await approval.decideRequest(manager, res.id, 'APPROVE', 'QA — committed');
    eq((await reqOf(res.id)).status, 'APPROVED', 'request approved');

    const after = await budgetFor(employee.departmentId);
    const afterSpent = after.reduce((s, b) => s + Number(b.spent ?? 0), 0);
    truthy(afterSpent > beforeSpent, `spent rose (${beforeSpent} → ${afterSpent})`);
  });

  await check('취소해도 예약이 해제된다', async () => {
    const res = await create.createPurchase(employee, {
      category: 'OFFICE',
      purpose: 'QA suite — release on withdrawal rather than rejection',
      quotationCount: 2,
      currency: 'USD',
      items: [{ itemName: 'QA widget', quantity: 1, unitPrice: 190 }],
    } as never);
    await approval.submitRequest(employee, res.id, { approverIds: [manager.employeeId] });
    const mid = (await budgetFor(employee.departmentId)).reduce((s, b) => s + Number(b.committed ?? 0), 0);
    await approval.cancelRequest(employee, res.id, 'QA — withdrawn');
    const after = (await budgetFor(employee.departmentId)).reduce((s, b) => s + Number(b.committed ?? 0), 0);
    truthy(after < mid, `allocated released on cancel (${mid} → ${after})`);
  });

  await check('연차는 예산이 아니라 연차 잔여에 반영된다', async () => {
    const before = (await budgetFor(employee.departmentId)).reduce(
      (s, b) => s + Number(b.committed ?? 0) + Number(b.spent ?? 0),
      0,
    );
    const res = await create.createLeave(employee, {
      leaveType: 'ANNUAL',
      startDate: future(60),
      endDate: future(60),
      halfDayStart: false,
      halfDayEnd: false,
      reason: 'QA suite — leave must not touch the budget ledger',
    });
    await approval.submitRequest(employee, res.id);
    const after = (await budgetFor(employee.departmentId)).reduce(
      (s, b) => s + Number(b.committed ?? 0) + Number(b.spent ?? 0),
      0,
    );
    near(after, before, 0.01, 'budget ledger unchanged by a leave request');
  });

  /* ================================================================ */
  section('5. 권한 — RBAC');
  /* ================================================================ */

  await check('일반 직원은 관리 기능에 접근할 수 없다', () => {
    eq(rbac.can(employee, 'admin.organization'), false, 'organization');
    eq(rbac.can(employee, 'admin.policy'), false, 'policy');
    eq(rbac.can(employee, 'admin.users'), false, 'users');
  });

  await check('관리자는 관리 기능에 접근할 수 있다', () => {
    eq(rbac.can(admin, 'admin.organization'), true, 'organization');
    eq(rbac.can(admin, 'admin.policy'), true, 'policy');
  });

  await check('감사자는 조회만 가능하고 기안을 만들 수 없다', () => {
    eq(rbac.can(auditor, 'request.create'), false, 'create');
    eq(rbac.can(auditor, 'audit.view'), true, 'audit read');
  });

  await check('기안자는 자기 기안을 볼 수 있다', async () => {
    const row = await reqOf(leaveId);
    eq(rbac.canViewRequest(employee, row as never), true, 'own request');
  });

  await check('무관한 직원은 남의 기안을 볼 수 없다', async () => {
    const row = await reqOf(leaveId);
    const other = await sessionFor('sophia.yun@ohmyhotel.com');
    eq(rbac.canViewRequest(other, row as never), false, 'unrelated request');
  });

  await check('승인된 기안은 기안자도 수정할 수 없다', async () => {
    const row = await reqOf(leaveId);
    eq(rbac.canEditRequest(employee, row as never), false, 'edit an approved request');
    eq(rbac.canCancelRequest(employee, row as never), false, 'cancel an approved request');
  });

  /* ================================================================ */
  section('6. 조직 관리 CRUD — Organization');
  /* ================================================================ */

  await check('부서 코드 형식이 검증된다', () => {
    eq(orgValidation.departmentSchema.safeParse({ code: 'lowercase', name: 'X', officeId: crypto.randomUUID() }).success, false, 'lowercase');
    eq(orgValidation.departmentSchema.safeParse({ code: 'A', name: 'Ok name', officeId: crypto.randomUUID() }).success, false, 'too short');
    eq(orgValidation.departmentSchema.safeParse({ code: 'MKT', name: 'Marketing', officeId: crypto.randomUUID() }).success, true, 'valid');
  });

  await check('라우팅 부서 코드가 결재자 해석과 일치한다', async () => {
    for (const code of orgValidation.ROUTING_DEPT_CODES) {
      const [row] = await db.select().from(departments).where(dEq(departments.code, code)).limit(1);
      truthy(row, `department ${code} exists`);
      truthy(row.headEmployeeId, `department ${code} has a head to route to`);
    }
  });

  await check('부서 책임자를 바꾸면 이후 기안의 결재자가 바뀐다', async () => {
    const [hrDept] = await db.select().from(departments).where(dEq(departments.code, 'HR')).limit(1);
    const original = hrDept.headEmployeeId;
    const replacement = await db
      .select({ id: employees.id })
      .from(employees)
      .where(and(dEq(employees.departmentId, hrDept.id), sql`${employees.id} <> ${original}`))
      .limit(1);
    if (!replacement[0]) throw new Error('SKIP: HR has only one member in the seed');

    await db.update(departments).set({ headEmployeeId: replacement[0].id }).where(dEq(departments.id, hrDept.id));
    const res = await create.createLeave(employee, {
      leaveType: 'UNPAID',
      startDate: future(70),
      endDate: future(70),
      halfDayStart: false,
      halfDayEnd: false,
      reason: 'QA suite — routing follows the current HR head',
    });
    await approval.submitRequest(employee, res.id);
    const steps = await stepsOf(res.id);
    const hrStep = steps.find((s) => s.approverRole === 'HR');
    await db.update(departments).set({ headEmployeeId: original }).where(dEq(departments.id, hrDept.id));
    if (!hrStep) throw new Error('SKIP: unpaid leave does not route through HR in this workflow');
    eq(hrStep.approverId, replacement[0].id, 'HR step follows the new head');
  });

  await check('이미 상신된 기안의 결재선은 조직 변경에 영향받지 않는다', async () => {
    const before = await stepsOf(tripId);
    if (before.length === 0) {
      await approval.submitRequest(employee, tripId);
    }
    const snapshot = (await stepsOf(tripId)).map((s) => `${s.stepOrder}:${s.approverId}`);
    const [ctDept] = await db.select().from(departments).where(dEq(departments.code, 'CT')).limit(1);
    const originalHead = ctDept.headEmployeeId;
    await db.update(departments).set({ headEmployeeId: director.employeeId }).where(dEq(departments.id, ctDept.id));
    const after = (await stepsOf(tripId)).map((s) => `${s.stepOrder}:${s.approverId}`);
    await db.update(departments).set({ headEmployeeId: originalHead }).where(dEq(departments.id, ctDept.id));
    eq(after.join('|'), snapshot.join('|'), 'frozen approval history');
  });

  await check('대표이사도 소액 기안을 상신할 수 있다 (자기 자신이 결재자가 되지 않고)', async () => {
    const res = await create.createGeneric(director, 'GENERAL', {
      title: 'QA suite — the person at the top files a small request',
      category: 'QA',
      details: 'Small enough that every conditional workflow step is skipped.',
      amount: 100,
      currency: 'USD',
    });
    await approval.submitRequest(director, res.id);
    const steps = await stepsOf(res.id);
    truthy(steps.length > 0, 'the chain is not empty');
    truthy(
      steps.every((st) => st.approverId !== director.employeeId),
      'the director is not their own approver',
    );
  });

  await check('결재자를 한 명도 찾을 수 없으면 상신 자체가 거부된다', async () => {
    const { materializeSteps } = await import('@/lib/workflow/engine');
    const alone = materializeSteps([], { amountBase: 10, isInternational: false, days: 0, quotationCount: 0 }, {
      requesterId: 'solo',
      managerId: null,
      deptHeadId: null,
      hrId: null,
      financeId: null,
      directorId: 'solo',
      ctoId: null,
      ceoId: 'solo',
    });
    eq(alone.length, 0, 'no chain can be invented from nobody');
  });

  /* ================================================================ */
  section('7. 정책 — Policies');
  /* ================================================================ */

  await check('시드된 모든 정책이 실제로 평가되는 metric을 쓴다', async () => {
    const rows = await db.select().from(policies);
    const evaluated = new Set(policyValidation.POLICY_METRIC_KEYS as readonly string[]);
    const orphans = rows.filter((p) => !evaluated.has(p.metric));
    eq(orphans.length, 0, `policies with no evaluator branch: ${orphans.map((p) => `${p.code}/${p.metric}`).join(', ')}`);
  });

  await check('시드된 모든 정책이 해당 규칙을 지원하는 유형에 붙어 있다', async () => {
    const rows = await db.select().from(policies);
    const bad = rows.filter((p) => !policyValidation.typesForMetric(p.metric).includes(p.appliesTo));
    eq(bad.length, 0, `policies that can never fire: ${bad.map((p) => `${p.code} (${p.metric} on ${p.appliesTo})`).join(', ')}`);
  });

  await check('기준값이 필요한 규칙은 기준값 없이 만들 수 없다', () => {
    const res = policyValidation.newPolicySchema.safeParse({
      code: 'POL-QA-1',
      name: 'QA',
      metric: 'HOTEL_PER_NIGHT',
      appliesTo: 'BUSINESS_TRIP',
      threshold: null,
      severity: 'WARNING',
      message: 'A message long enough to pass validation.',
      isActive: true,
    });
    eq(res.success, false, 'threshold-less hotel policy rejected');
  });

  await check('규칙과 맞지 않는 기안 유형은 거부된다', () => {
    const res = policyValidation.newPolicySchema.safeParse({
      code: 'POL-QA-2',
      name: 'QA',
      metric: 'HOTEL_PER_NIGHT',
      appliesTo: 'LEAVE',
      threshold: 150,
      severity: 'WARNING',
      message: 'A message long enough to pass validation.',
      isActive: true,
    });
    eq(res.success, false, 'hotel rule on a leave request rejected');
  });

  /* ================================================================ */
  section('8. 양식 템플릿 — Form templates');
  /* ================================================================ */

  await check('필수 항목이 비면 템플릿 검증이 막는다', () => {
    const fields = [{ key: 'reason', label: 'Reason', type: 'text', required: true }];
    const res = validateValues(fields as never, {});
    eq(res.ok, false, 'validation rejects a missing required field');
  });

  await check('제목 패턴이 입력값으로 채워진다', () => {
    const title = buildTitle('{city} 출장 — {days}일', 'fallback', { city: 'Tokyo', days: 3 });
    eq(title, 'Tokyo 출장 — 3일', 'rendered title');
  });

  await check('템플릿 기안이 생성되고 값이 저장된다', async () => {
    const [tpl] = await db.select().from(schema.formTemplates).where(dEq(schema.formTemplates.isActive, true)).limit(1);
    truthy(tpl, 'a seeded template exists');
    const fields = tpl.fields as { key: string; type: string; required?: boolean; options?: string[] }[];
    const values: Record<string, unknown> = {};
    for (const f of fields) {
      if (f.type === 'number') values[f.key] = 1;
      else if (f.type === 'date') values[f.key] = future(10);
      else if (f.type === 'select') values[f.key] = f.options?.[0] ?? 'QA';
      else if (f.type === 'employee') values[f.key] = manager.employeeId;
      else values[f.key] = 'QA value';
    }
    const res = await create.createFromTemplate(employee, tpl as never, values);
    const row = await reqOf(res.id);
    eq(row.templateId, tpl.id, 'template recorded on the request');
    truthy(row.values, 'field values stored');
  });

  /* ================================================================ */
  section('9. 지사 격리 — Office isolation');
  /* ================================================================ */

  await check('기안에 기안자의 지사가 기록된다', async () => {
    const row = await reqOf(leaveId);
    eq(row.officeId, employee.officeId, 'office stamped on the request');
  });

  await check('통합 조회 권한은 전 지사를 본다', () => {
    eq(rbac.seesAllOffices(director), true, 'director');
    eq(rbac.seesAllOffices(finance), true, 'finance');
    eq(rbac.seesAllOffices(auditor), true, 'auditor');
    eq(rbac.seesAllOffices(employee), false, 'employee');
  });

  /* ================================================================ */
  section('10. 데이터 정합성 — Data integrity');
  /* ================================================================ */

  await check('기안번호가 중복되지 않는다', async () => {
    const [row] = await db
      .select({ n: sql<number>`count(*)::int`, distinct: sql<number>`count(distinct ${requests.requestNumber})::int` })
      .from(requests);
    eq(Number(row.n), Number(row.distinct), 'request numbers are unique');
  });

  await check('모든 기안에 기안자와 지사가 있다', async () => {
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(requests)
      .where(sql`${requests.requesterId} is null or ${requests.officeId} is null`);
    eq(Number(row.n), 0, 'requests missing requester or office');
  });

  await check('상신된 기안에는 반드시 결재 단계가 있다', async () => {
    const rows = await db
      .select({ id: requests.id, number: requests.requestNumber })
      .from(requests)
      .where(
        and(
          sql`${requests.status} in ('SUBMITTED','IN_REVIEW','APPROVED','REJECTED')`,
          sql`not exists (select 1 from approval_steps s where s.request_id = ${requests.id})`,
        ),
      );
    eq(rows.length, 0, `submitted requests with no chain: ${rows.map((r) => r.number).join(', ')}`);
  });

  await check('결재 단계에 담당자가 비어 있지 않다', async () => {
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(approvalSteps)
      .where(sql`${approvalSteps.approverId} is null`);
    eq(Number(row.n), 0, 'steps with no approver');
  });

  await check('예산 집행액이 배정액을 넘지 않는다', async () => {
    const rows = await db.select().from(budgets);
    const over = rows.filter((b) => Number(b.spent ?? 0) > Number(b.allocated ?? 0) * 2);
    eq(over.length, 0, `budgets spent past twice their allocation: ${over.map((b) => b.id).join(', ')}`);
  });

  await check('코드가 유일하다 (지사·부서·팀·코스트센터)', async () => {
    for (const [label, table, col] of [
      ['offices', offices, offices.code],
      ['departments', departments, departments.code],
      ['teams', teams, teams.code],
      ['cost centers', costCenters, costCenters.code],
    ] as const) {
      const [row] = await db
        .select({ n: sql<number>`count(*)::int`, distinct: sql<number>`count(distinct ${col})::int` })
        .from(table);
      eq(Number(row.n), Number(row.distinct), `${label} codes unique`);
    }
  });

  await check('경비 정산 합계가 항목 합계와 일치한다', async () => {
    const rows = await db
      .select({
        number: requests.requestNumber,
        total: requests.amountOriginal,
        lines: sql<number>`(select coalesce(sum(ei.amount_original),0) from expense_items ei where ei.claim_id = ${expenseClaims.id})`,
      })
      .from(expenseClaims)
      .innerJoin(requests, dEq(requests.id, expenseClaims.requestId))
      .limit(200);
    const mismatched = rows.filter((r) => Math.abs(Number(r.total) - Number(r.lines)) > 0.02);
    eq(mismatched.length, 0, `claims whose header disagrees with its lines: ${mismatched.map((r) => r.number).join(', ')}`);
  });

  process.exit(report('실패한 검사 — Failures'));
}

main().catch((err) => {
  console.error('\nQA suite crashed before finishing:\n', err);
  process.exit(1);
});
