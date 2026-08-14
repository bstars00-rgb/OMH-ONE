import type { MessageTable } from '../types';

/**
 * Domain vocabulary: statuses, request types, roles, categories.
 *
 * These are the highest-leverage strings in the app — they appear in badges,
 * filters, charts, reports and AI sentences. Keeping them in one table means a
 * status renders identically everywhere it is shown.
 */
export const domain: MessageTable = {
  /* --- request types --- */
  'type.LEAVE': { en: 'Annual Leave', ko: '연차 신청' },
  'type.LEAVE.short': { en: 'Leave', ko: '연차' },
  'type.BUSINESS_TRIP': { en: 'Business Trip', ko: '출장 신청' },
  'type.BUSINESS_TRIP.short': { en: 'Trip', ko: '출장' },
  'type.PURCHASE': { en: 'Purchase Request', ko: '구매 요청' },
  'type.PURCHASE.short': { en: 'PR', ko: '구매' },
  'type.EXPENSE': { en: 'Expense Claim', ko: '경비 정산' },
  'type.EXPENSE.short': { en: 'Expense', ko: '경비' },
  'type.HR': { en: 'HR Request', ko: '인사 요청' },
  'type.HR.short': { en: 'HR', ko: '인사' },
  'type.GENERAL': { en: 'General Approval', ko: '일반 결재' },
  'type.GENERAL.short': { en: 'General', ko: '일반' },

  /* --- statuses --- */
  'status.DRAFT': { en: 'Draft', ko: '임시저장' },
  'status.DRAFT.tip': { en: 'Not submitted yet. Only you can see this.', ko: '아직 상신하지 않았습니다. 본인만 볼 수 있습니다.' },
  'status.SUBMITTED': { en: 'Submitted', ko: '상신됨' },
  'status.SUBMITTED.tip': {
    en: 'Sent for approval, waiting for the first approver to open it.',
    ko: '결재 요청이 전달되었고, 첫 결재자가 아직 열람하지 않았습니다.',
  },
  'status.IN_REVIEW': { en: 'In review', ko: '검토중' },
  'status.IN_REVIEW.tip': { en: 'An approver has opened this and is reviewing it.', ko: '결재자가 열람하여 검토하고 있습니다.' },
  'status.APPROVED': { en: 'Approved', ko: '승인 완료' },
  'status.APPROVED.tip': { en: 'All approval steps completed.', ko: '모든 결재 단계가 완료되었습니다.' },
  'status.REJECTED': { en: 'Rejected', ko: '반려' },
  'status.REJECTED.tip': { en: 'Declined by an approver. Closed.', ko: '결재자가 반려했습니다. 종결 상태입니다.' },
  'status.RETURNED': { en: 'Returned', ko: '보완 요청' },
  'status.RETURNED.tip': {
    en: 'Sent back to the requester for correction, then resubmit.',
    ko: '기안자에게 보완을 요청했습니다. 수정 후 다시 상신하세요.',
  },
  'status.CANCELED': { en: 'Canceled', ko: '상신 취소' },
  'status.CANCELED.tip': { en: 'Withdrawn by the requester.', ko: '기안자가 상신을 취소했습니다.' },

  /* --- priority --- */
  'priority.CRITICAL': { en: 'Critical', ko: '긴급' },
  'priority.CRITICAL.tip': { en: 'Overdue or high financial impact.', ko: '기한이 지났거나 금액 영향이 큽니다.' },
  'priority.HIGH': { en: 'High', ko: '높음' },
  'priority.HIGH.tip': { en: 'Approaching SLA or above-average amount.', ko: '기한이 임박했거나 평균보다 큰 금액입니다.' },
  'priority.NORMAL': { en: 'Normal', ko: '보통' },
  'priority.NORMAL.tip': { en: 'Standard turnaround.', ko: '일반적인 처리 대상입니다.' },
  'priority.LOW': { en: 'Low', ko: '낮음' },
  'priority.LOW.tip': { en: 'Small amount, no policy flags.', ko: '소액이며 정책 위반 사항이 없습니다.' },

  /* --- risk --- */
  'risk.LOW': { en: 'Low risk', ko: '위험 낮음' },
  'risk.LOW.tip': { en: 'No policy or budget concerns detected.', ko: '정책·예산상 문제가 발견되지 않았습니다.' },
  'risk.MEDIUM': { en: 'Medium risk', ko: '위험 보통' },
  'risk.MEDIUM.tip': {
    en: 'One or more soft policy warnings. Review before approving.',
    ko: '정책 경고가 있습니다. 승인 전에 확인하세요.',
  },
  'risk.HIGH': { en: 'High risk', ko: '위험 높음' },
  'risk.HIGH.tip': {
    en: 'Budget breach or blocking policy violation. Read the detail before deciding.',
    ko: '예산 초과 또는 필수 정책 위반입니다. 상세 내용을 확인 후 결정하세요.',
  },
  'risk.notAssessed': { en: 'Not assessed', ko: '미분석' },

  /* --- roles --- */
  'role.SUPER_ADMIN': { en: 'Super Admin', ko: '최고 관리자' },
  'role.SUPER_ADMIN.desc': { en: 'Full configuration and data access.', ko: '모든 설정과 데이터에 접근합니다.' },
  'role.ADMIN': { en: 'Admin', ko: '관리자' },
  'role.ADMIN.desc': { en: 'Workflow, policy, org and user configuration.', ko: '결재선·정책·조직·사용자를 설정합니다.' },
  'role.DIRECTOR': { en: 'Director', ko: '임원' },
  'role.DIRECTOR.desc': { en: 'Company-wide approval and analytics.', ko: '전사 결재와 분석 권한을 가집니다.' },
  'role.HR': { en: 'HR', ko: '인사' },
  'role.HR.desc': { en: 'Employee records, leave data, HR requests.', ko: '인사 정보, 연차 데이터, 인사 요청을 담당합니다.' },
  'role.FINANCE': { en: 'Finance', ko: '재무' },
  'role.FINANCE.desc': { en: 'Expense, procurement and budget.', ko: '경비·구매·예산을 담당합니다.' },
  'role.MANAGER': { en: 'Manager', ko: '팀장' },
  'role.MANAGER.desc': { en: 'Own department requests and approvals.', ko: '소속 부서의 기안과 결재를 담당합니다.' },
  'role.EMPLOYEE': { en: 'Employee', ko: '일반 직원' },
  'role.EMPLOYEE.desc': { en: 'Own requests only.', ko: '본인 기안만 조회합니다.' },
  'role.AUDITOR': { en: 'Auditor', ko: '감사' },
  'role.AUDITOR.desc': { en: 'Read-only access across the company.', ko: '전사 데이터를 조회만 할 수 있습니다.' },

  /* --- approver roles (workflow steps) --- */
  'approverRole.MANAGER': { en: 'Manager', ko: '팀장' },
  'approverRole.DEPT_HEAD': { en: 'Department Head', ko: '부서장' },
  'approverRole.HR': { en: 'HR', ko: '인사팀' },
  'approverRole.FINANCE': { en: 'Finance', ko: '재무팀' },
  'approverRole.DIRECTOR': { en: 'Director', ko: '임원' },

  /* --- workflow step names as seeded --- */
  'step.Line Manager': { en: 'Line Manager', ko: '팀장 결재' },
  'step.Department Head': { en: 'Department Head', ko: '부서장 결재' },
  'step.HR Review': { en: 'HR Review', ko: '인사팀 검토' },
  'step.Finance Review': { en: 'Finance Review', ko: '재무팀 검토' },
  'step.Director Approval': { en: 'Director Approval', ko: '임원 승인' },

  /* --- leave types --- */
  'leaveType.ANNUAL': { en: 'Annual', ko: '연차' },
  'leaveType.SICK': { en: 'Sick', ko: '병가' },
  'leaveType.UNPAID': { en: 'Unpaid', ko: '무급휴가' },
  'leaveType.SPECIAL': { en: 'Special', ko: '경조휴가' },
  'leaveType.OTHER': { en: 'Other', ko: '기타' },

  /* --- expense categories --- */
  'expenseCategory.TRAVEL': { en: 'Travel', ko: '교통비' },
  'expenseCategory.HOTEL': { en: 'Hotel', ko: '숙박비' },
  'expenseCategory.FLIGHT': { en: 'Flight', ko: '항공료' },
  'expenseCategory.MEAL': { en: 'Meal', ko: '식비' },
  'expenseCategory.MARKETING': { en: 'Marketing', ko: '마케팅' },
  'expenseCategory.OFFICE': { en: 'Office', ko: '사무용품' },
  'expenseCategory.ENTERTAINMENT': { en: 'Entertainment', ko: '접대비' },
  'expenseCategory.SOFTWARE': { en: 'Software', ko: '소프트웨어' },
  'expenseCategory.OTHER': { en: 'Other', ko: '기타' },

  /* --- trip cost categories --- */
  'tripCost.FLIGHT': { en: 'Flight', ko: '항공료' },
  'tripCost.HOTEL': { en: 'Hotel', ko: '숙박비' },
  'tripCost.TRANSPORT': { en: 'Transport', ko: '현지 교통비' },
  'tripCost.MEAL': { en: 'Meal', ko: '식비' },
  'tripCost.EVENT_FEE': { en: 'Event fee', ko: '행사 참가비' },
  'tripCost.VISA': { en: 'Visa', ko: '비자' },
  'tripCost.OTHER': { en: 'Other', ko: '기타' },

  /* --- purchase categories --- */
  'purchaseCategory.IT': { en: 'IT', ko: 'IT 장비' },
  'purchaseCategory.OFFICE': { en: 'Office', ko: '사무용품' },
  'purchaseCategory.MARKETING': { en: 'Marketing', ko: '마케팅' },
  'purchaseCategory.SOFTWARE': { en: 'Software', ko: '소프트웨어' },
  'purchaseCategory.SERVICE': { en: 'Service', ko: '용역' },
  'purchaseCategory.OTHER': { en: 'Other', ko: '기타' },

  /* --- budget categories --- */
  'budgetCategory.TRAVEL': { en: 'Travel', ko: '출장' },
  'budgetCategory.PROCUREMENT': { en: 'Procurement', ko: '구매' },
  'budgetCategory.OPERATING': { en: 'Operating', ko: '운영' },
  'budgetCategory.MARKETING': { en: 'Marketing', ko: '마케팅' },

  /* --- payment methods --- */
  'payment.PERSONAL': { en: 'Personal money (reimburse me)', ko: '개인 지출 (환급 요청)' },
  'payment.CORPORATE_CARD': { en: 'Corporate card', ko: '법인카드' },
  'payment.COMPANY_ACCOUNT': { en: 'Company account', ko: '법인 계좌' },
  'payment.PERSONAL.short': { en: 'Personal', ko: '개인 지출' },
  'payment.CORPORATE_CARD.short': { en: 'Corporate card', ko: '법인카드' },
  'payment.COMPANY_ACCOUNT.short': { en: 'Company account', ko: '법인 계좌' },

  /* --- employment --- */
  'employment.FULL_TIME': { en: 'Full time', ko: '정규직' },
  'employment.PART_TIME': { en: 'Part time', ko: '시간제' },
  'employment.CONTRACT': { en: 'Contract', ko: '계약직' },
  'employeeStatus.ACTIVE': { en: 'Active', ko: '재직' },
  'employeeStatus.ON_LEAVE': { en: 'On leave', ko: '휴직' },
  'employeeStatus.RESIGNED': { en: 'Resigned', ko: '퇴사' },

  /* --- departments (codes are stable; these are the display names) --- */
  'dept.CEO': { en: 'CEO Office', ko: '대표이사실' },
  'dept.SCM': { en: 'Supply Chain Management', ko: '공급망관리팀' },
  'dept.GSM': { en: 'Global Sales & Marketing', ko: '글로벌영업마케팅팀' },
  'dept.OP': { en: 'Operations', ko: '운영팀' },
  'dept.CT': { en: 'Content Team', ko: '콘텐츠팀' },
  'dept.IT': { en: 'Information Technology', ko: '정보기술팀' },
  'dept.FIN': { en: 'Finance', ko: '재무팀' },
  'dept.HR': { en: 'Human Resources', ko: '인사팀' },

  /* --- audit actions --- */
  'audit.CREATE': { en: 'Create', ko: '작성' },
  'audit.EDIT': { en: 'Edit', ko: '수정' },
  'audit.SUBMIT': { en: 'Submit', ko: '상신' },
  'audit.APPROVE': { en: 'Approve', ko: '승인' },
  'audit.REJECT': { en: 'Reject', ko: '반려' },
  'audit.RETURN': { en: 'Return', ko: '보완 요청' },
  'audit.CANCEL': { en: 'Cancel', ko: '상신 취소' },
  'audit.DELETE': { en: 'Delete', ko: '삭제' },
  'audit.EXPORT': { en: 'Export', ko: '내보내기' },
  'audit.LOGIN': { en: 'Login', ko: '로그인' },
  'audit.LOGOUT': { en: 'Logout', ko: '로그아웃' },
  'audit.LOGIN_FAILED': { en: 'Login failed', ko: '로그인 실패' },
  'audit.PERMISSION_DENIED': { en: 'Permission denied', ko: '권한 거부' },
  'audit.POLICY_CHANGE': { en: 'Policy change', ko: '정책 변경' },
  'audit.ROLE_CHANGE': { en: 'Role change', ko: '권한 변경' },
  'audit.WORKFLOW_CHANGE': { en: 'Workflow change', ko: '결재선 변경' },
  'audit.SETTING_CHANGE': { en: 'Setting change', ko: '설정 변경' },
  'audit.AI_RECOMMENDATION': { en: 'AI recommendation', ko: 'AI 추천' },
  'audit.VIEW': { en: 'View', ko: '열람' },
  'audit.session': { en: 'Session', ko: '세션' },
  'audit.request': { en: 'Request', ko: '기안' },
  'audit.report': { en: 'Report', ko: '리포트' },
  'audit.policy': { en: 'Policy', ko: '정책' },
  'audit.user': { en: 'User', ko: '사용자' },
  'audit.approval_workflow': { en: 'Workflow', ko: '결재선' },
  'audit.system_setting': { en: 'Setting', ko: '설정' },

  /* --- scope labels --- */
  'scope.company': { en: 'Company-wide', ko: '전사' },
  'scope.hr': { en: 'HR & leave scope', ko: '인사·연차 범위' },
  'scope.finance': { en: 'Finance scope', ko: '재무 범위' },
  'scope.department': { en: '{dept} scope', ko: '{dept} 범위' },
  'scope.own': { en: 'Your requests', ko: '본인 기안' },
};
