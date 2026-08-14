import type { MessageTable } from '../types';

/** Navigation, header, login and the global surfaces around every page. */
export const shell: MessageTable = {
  /* --- nav sections --- */
  'nav.section.main': { en: 'Main', ko: '메인' },
  'nav.section.work': { en: 'Work', ko: '업무' },
  'nav.section.people': { en: 'People', ko: '인사' },
  'nav.section.finance': { en: 'Finance', ko: '재무' },
  'nav.section.travel': { en: 'Travel', ko: '출장' },
  'nav.section.management': { en: 'Management', ko: '경영' },
  'nav.section.admin': { en: 'Admin', ko: '관리자' },

  /* --- nav items --- */
  'nav.home': { en: 'Home', ko: '홈' },
  'nav.assistant': { en: 'AI Assistant', ko: 'AI 어시스턴트' },
  'nav.approvals': { en: 'Approvals', ko: '결재함' },
  'nav.requests': { en: 'My Requests', ko: '내 기안' },
  'nav.people': { en: 'Employees', ko: '임직원' },
  'nav.leave': { en: 'Leave', ko: '연차' },
  'nav.calendar': { en: 'Calendar', ko: '캘린더' },
  'nav.expenses': { en: 'Expenses', ko: '경비' },
  'nav.procurement': { en: 'Purchase Requests', ko: '구매 요청' },
  'nav.budgets': { en: 'Budgets', ko: '예산' },
  'nav.travel': { en: 'Business Trips', ko: '출장' },
  'nav.analytics': { en: 'Analytics', ko: '분석' },
  'nav.reports': { en: 'Reports', ko: '리포트' },
  'nav.audit': { en: 'Audit Logs', ko: '감사 로그' },
  'nav.admin.workflows': { en: 'Workflow Builder', ko: '결재선 설정' },
  'nav.admin.policies': { en: 'Policies', ko: '정책 관리' },
  'nav.admin.organization': { en: 'Organization', ko: '조직 관리' },
  'nav.admin.users': { en: 'Users', ko: '사용자 관리' },
  'nav.admin.settings': { en: 'System Settings', ko: '시스템 설정' },
  'nav.openMenu': { en: 'Open navigation', ko: '메뉴 열기' },
  'nav.closeMenu': { en: 'Close navigation', ko: '메뉴 닫기' },
  'nav.main': { en: 'Main', ko: '주 메뉴' },

  /* --- header --- */
  'header.searchPlaceholder': { en: 'Search requests, people, trips…', ko: '기안, 임직원, 출장 검색…' },
  'header.commandPlaceholder': { en: 'Search or jump to…', ko: '검색하거나 바로 이동…' },
  'header.commandLabel': { en: 'Search or jump to', ko: '검색 또는 바로가기' },
  'header.commandBar': { en: 'Command bar', ko: '명령 팔레트' },
  'header.actions': { en: 'Actions', ko: '바로가기' },
  'header.toOpen': { en: 'to open', ko: '열기' },
  'header.toNavigate': { en: '↑↓ to navigate', ko: '↑↓ 이동' },
  'header.noSearchResults': {
    en: 'No results for “{query}”. Try a request number, a person, or a city.',
    ko: '“{query}” 검색 결과가 없습니다. 기안번호, 이름, 도시명으로 검색해 보세요.',
  },
  'header.group.Requests': { en: 'Requests', ko: '기안' },
  'header.group.Business trips': { en: 'Business trips', ko: '출장' },
  'header.group.Employees': { en: 'Employees', ko: '임직원' },
  'header.group.Vendors': { en: 'Vendors', ko: '거래처' },

  /* --- command bar quick actions --- */
  'command.newTrip': { en: 'New business trip', ko: '출장 신청' },
  'command.newPurchase': { en: 'New purchase request', ko: '구매 요청' },
  'command.newExpense': { en: 'New expense claim', ko: '경비 정산' },
  'command.newLeave': { en: 'New leave request', ko: '연차 신청' },
  'command.askAi': { en: 'Ask OHMY AI', ko: 'OHMY AI에게 질문' },
  'command.openDashboard': { en: 'Open dashboard', ko: '대시보드 열기' },
  'command.approvalInbox': { en: 'Approval inbox', ko: '결재함 열기' },
  'command.directory': { en: 'Employee directory', ko: '임직원 조회' },

  /* --- theme --- */
  'theme.change': { en: 'Theme: {theme}. Change theme', ko: '테마: {theme}. 테마 변경' },
  'theme.light': { en: 'Light', ko: '라이트' },
  'theme.dark': { en: 'Dark', ko: '다크' },
  'theme.system': { en: 'System', ko: '시스템' },

  /* --- language --- */
  'language.change': { en: 'Change language', ko: '언어 변경' },
  'language.label': { en: 'Language', ko: '언어' },

  /* --- office / tenant --- */
  'office.switch': { en: 'Switch office', ko: '지사 전환' },
  'office.viewing': { en: 'Viewing', ko: '조회 범위' },
  'office.all': { en: 'All offices', ko: '전사' },
  'office.allConsolidated': { en: 'All offices (consolidated)', ko: '전사 통합' },
  'office.ownOnly': { en: 'Your office. Requests are scoped to it.', ko: '소속 지사입니다. 기안은 이 범위로 제한됩니다.' },
  'office.consolidatedNote': {
    en: 'Executives, Finance, administrators and auditors can view every office. Everyone else sees only their own.',
    ko: '임원·재무·관리자·감사는 전 지사를 조회할 수 있습니다. 그 외에는 소속 지사만 조회됩니다.',
  },
  'office.label': { en: 'Office', ko: '지사' },
  'office.scopedTo': { en: 'Scoped to {office}', ko: '{office} 기준' },
  'office.consolidated': { en: 'Consolidated across all offices', ko: '전 지사 통합 기준' },
  'office.switchDenied': { en: 'Your role is limited to your own office.', ko: '현재 권한은 소속 지사로 제한됩니다.' },
  'office.unknown': { en: 'Unknown office.', ko: '알 수 없는 지사입니다.' },
  'office.switched': { en: 'Office switched.', ko: '지사가 전환되었습니다.' },

  /* --- notifications --- */
  'notif.title': { en: 'Notifications', ko: '알림' },
  'notif.aria': { en: 'Notifications', ko: '알림' },
  'notif.ariaUnread': { en: 'Notifications, {count} unread', ko: '알림, 읽지 않음 {count}건' },
  'notif.markAllRead': { en: 'Mark all read', ko: '모두 읽음' },
  'notif.unread': { en: 'Unread', ko: '읽지 않음' },
  'notif.empty': { en: 'Nothing new', ko: '새 알림이 없습니다' },
  'notif.emptyHint': {
    en: 'Approval requests and status changes will appear here.',
    ko: '결재 요청과 상태 변경 알림이 여기에 표시됩니다.',
  },
  'notif.goToInbox': { en: 'Go to approval inbox →', ko: '결재함으로 이동 →' },

  /* --- user menu --- */
  'user.menuFor': { en: 'Account menu for {name}', ko: '{name} 계정 메뉴' },
  'user.roles': { en: 'Roles', ko: '보유 권한' },
  'user.myProfile': { en: 'My profile', ko: '내 프로필' },
  'user.myRequests': { en: 'My requests', ko: '내 기안' },

  /* --- login --- */
  'login.title': { en: 'Sign in', ko: '로그인' },
  'login.subtitle': { en: 'Use a demo account below, or your own credentials.', ko: '아래 데모 계정을 사용하거나 본인 계정으로 로그인하세요.' },
  'login.tagline': { en: 'One place to request, approve, analyze and operate.', ko: '기안부터 결재, 분석, 운영까지 한 곳에서.' },
  'login.blurb': {
    en: 'Approvals, leave, travel, procurement and expense in a single system — with AI that summarizes the request, checks it against company policy, and tells the approver what actually needs their attention.',
    ko: '결재·연차·출장·구매·경비를 하나의 시스템에서 처리합니다. AI가 기안 내용을 요약하고 회사 정책과 대조해, 결재자가 정말 확인해야 할 부분만 짚어 줍니다.',
  },
  'login.point1': {
    en: 'Every request routed automatically by amount, duration and destination',
    ko: '금액·기간·목적지에 따라 결재선이 자동으로 결정됩니다',
  },
  'login.point2': { en: 'Policy and budget checked before a human reads it', ko: '사람이 읽기 전에 정책과 예산을 먼저 검증합니다' },
  'login.point3': { en: 'Ask questions of company data in plain language', ko: '회사 데이터를 자연어로 질문할 수 있습니다' },
  'login.disclaimer': {
    en: 'Prototype environment. All employees, vendors and figures shown are fictional demo data.',
    ko: '프로토타입 환경입니다. 표시되는 임직원·거래처·수치는 모두 가상의 데모 데이터입니다.',
  },
  'login.demoAccounts': { en: 'Demo accounts — password {password}', ko: '데모 계정 — 비밀번호 {password}' },
  'login.demoHint': {
    en: 'Selecting an account fills the form — it does not sign you in. These are prototype credentials and are not valid anywhere else.',
    ko: '계정을 선택하면 입력란이 채워집니다. 바로 로그인되지는 않습니다. 프로토타입 전용 계정이며 다른 곳에서는 사용할 수 없습니다.',
  },
  'login.error': { en: 'Email or password is incorrect.', ko: '이메일 또는 비밀번호가 올바르지 않습니다.' },
  'login.errorEmpty': { en: 'Enter your email and password.', ko: '이메일과 비밀번호를 입력하세요.' },
  'login.sessionExpired': { en: 'Your session is no longer valid. Please sign in again.', ko: '세션이 만료되었습니다. 다시 로그인해 주세요.' },
};
