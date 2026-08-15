/**
 * Seeded form templates.
 *
 * These mirror the forms OHMY actually runs today, taken from the groupware
 * 기안서작성 list: Korean HR paperwork, the Japanese office's own documents
 * (押印申請, 出張伺書, 休暇届, 遅刻・早退・欠勤届) and the shared C/C and T/R
 * settlement forms. They are seeded so the feature has real content on day one,
 * but nothing here is special: an administrator can add, edit or retire any of
 * them from the UI, and the AI generator produces rows of exactly this shape.
 *
 * `office` is a code (KR / JP / SG / CN / VN) or null for company-wide. It
 * replaces the "[Ohmy_JP]" prefix those form names carry today — the office
 * becomes structure rather than a string a person has to type correctly.
 */

export interface TemplateSeed {
  code: string;
  nameEn: string;
  nameKo: string;
  descriptionEn?: string;
  descriptionKo?: string;
  office: string | null;
  category: 'HR' | 'FINANCE' | 'TRAVEL' | 'DOCUMENT' | 'GENERAL';
  icon: string;
  titlePattern: string;
  amountField?: string;
  /** Words people type that the form name does not contain. */
  keywords: string[];
  sortOrder: number;
  fields: {
    key: string;
    labelEn: string;
    labelKo: string;
    type: 'text' | 'textarea' | 'number' | 'money' | 'date' | 'select' | 'checkbox' | 'employee';
    required?: boolean;
    options?: { value: string; labelEn: string; labelKo: string }[];
    hintEn?: string;
    hintKo?: string;
  }[];
}

export const FORM_TEMPLATES: TemplateSeed[] = [
  /* ------------------------------ HR ------------------------------ */
  {
    code: 'HR-RESIGN',
    nameEn: 'Resignation',
    nameKo: '사직서',
    descriptionEn: 'Notice of resignation with the intended last working day.',
    descriptionKo: '퇴사 의사와 최종 근무일을 제출합니다.',
    office: null,
    category: 'HR',
    icon: 'LogOut',
    titlePattern: '사직서 — {lastWorkingDay}',
    keywords: ["사직","퇴사","그만","사표","이직","resign","quit","leaving","notice"],
    sortOrder: 10,
    fields: [
      { key: 'lastWorkingDay', labelEn: 'Last working day', labelKo: '최종 근무일', type: 'date', required: true },
      {
        key: 'reason',
        labelEn: 'Reason',
        labelKo: '사직 사유',
        type: 'textarea',
        required: true,
        hintEn: 'Kept confidential to HR and your line manager.',
        hintKo: '인사팀과 직속 상급자에게만 공개됩니다.',
      },
      { key: 'handoverTo', labelEn: 'Hand over to', labelKo: '인수인계 대상', type: 'employee' },
    ],
  },
  {
    code: 'HR-HANDOVER',
    nameEn: 'Handover',
    nameKo: '인수인계서',
    descriptionEn: 'Transfer of duties, systems and open items to a colleague.',
    descriptionKo: '담당 업무, 시스템 권한, 진행 중 건을 인계합니다.',
    office: null,
    category: 'HR',
    icon: 'ArrowRightLeft',
    titlePattern: '인수인계서 — {effectiveDate}',
    keywords: ["인수인계","인계","업무이관","넘기","handover","handoff","transfer duties"],
    sortOrder: 11,
    fields: [
      { key: 'successor', labelEn: 'Successor', labelKo: '인수자', type: 'employee', required: true },
      { key: 'effectiveDate', labelEn: 'Effective date', labelKo: '인계일', type: 'date', required: true },
      { key: 'duties', labelEn: 'Duties handed over', labelKo: '인계 업무', type: 'textarea', required: true },
      { key: 'openItems', labelEn: 'Open items and deadlines', labelKo: '진행 중 건 및 기한', type: 'textarea' },
      { key: 'systemAccess', labelEn: 'System access to transfer', labelKo: '이관할 시스템 권한', type: 'textarea' },
    ],
  },
  {
    code: 'HR-PARENTAL',
    nameEn: 'Maternity / Parental Leave',
    nameKo: '출산전후휴가 및 육아휴직 신청서',
    descriptionEn: 'Statutory maternity or parental leave application.',
    descriptionKo: '법정 출산전후휴가 또는 육아휴직을 신청합니다.',
    office: null,
    category: 'HR',
    icon: 'Baby',
    titlePattern: '{leaveKind} {startDate} – {endDate}',
    keywords: ["출산","육아","육아휴직","출산휴가","배우자출산","maternity","parental","paternity"],
    sortOrder: 12,
    fields: [
      {
        key: 'leaveKind',
        labelEn: 'Leave type',
        labelKo: '휴가 종류',
        type: 'select',
        required: true,
        options: [
          { value: 'MATERNITY', labelEn: 'Maternity leave', labelKo: '출산전후휴가' },
          { value: 'PARENTAL', labelEn: 'Parental leave', labelKo: '육아휴직' },
          { value: 'SPOUSE', labelEn: 'Spousal maternity leave', labelKo: '배우자 출산휴가' },
        ],
      },
      { key: 'startDate', labelEn: 'Start date', labelKo: '시작일', type: 'date', required: true },
      { key: 'endDate', labelEn: 'End date', labelKo: '종료일', type: 'date', required: true },
      { key: 'dueDate', labelEn: 'Due / birth date', labelKo: '출산 예정일', type: 'date' },
      { key: 'handoverTo', labelEn: 'Hand over to', labelKo: '업무 인수인계', type: 'employee' },
    ],
  },
  {
    code: 'JP-ATTENDANCE',
    nameEn: 'Late / Early Leave / Absence',
    nameKo: '지각·조퇴·결근 신고서',
    descriptionEn: 'Japanese office attendance notification (遅刻・早退・欠勤届).',
    descriptionKo: '일본 지사 근태 신고서 (遅刻・早退・欠勤届).',
    office: 'JP',
    category: 'HR',
    icon: 'Clock',
    titlePattern: '{kind} {onDate}',
    keywords: ["지각","조퇴","결근","늦","早退","遅刻","欠勤","late","early leave","absence"],
    sortOrder: 13,
    fields: [
      {
        key: 'kind',
        labelEn: 'Type',
        labelKo: '구분',
        type: 'select',
        required: true,
        options: [
          { value: 'LATE', labelEn: 'Late arrival', labelKo: '지각' },
          { value: 'EARLY', labelEn: 'Early leave', labelKo: '조퇴' },
          { value: 'ABSENT', labelEn: 'Absence', labelKo: '결근' },
        ],
      },
      { key: 'onDate', labelEn: 'Date', labelKo: '해당 일자', type: 'date', required: true },
      { key: 'hours', labelEn: 'Hours affected', labelKo: '해당 시간', type: 'number' },
      { key: 'reason', labelEn: 'Reason', labelKo: '사유', type: 'textarea', required: true },
    ],
  },

  /* ---------------------------- DOCUMENT --------------------------- */
  {
    code: 'JP-SEAL-SALES',
    nameEn: 'Seal Application (Sales)',
    nameKo: '날인 신청서 (영업)',
    descriptionEn: 'Company seal for a sales contract (押印申請・Sales).',
    descriptionKo: '영업 계약서 날인을 신청합니다 (押印申請・Sales).',
    office: 'JP',
    category: 'DOCUMENT',
    icon: 'Stamp',
    titlePattern: '날인 신청 — {documentName} ({counterparty})',
    keywords: ["도장","날인","인감","직인","押印","捺印","계약서","seal","stamp","sign contract"],
    sortOrder: 20,
    fields: [
      { key: 'documentName', labelEn: 'Document name', labelKo: '문서명', type: 'text', required: true },
      { key: 'counterparty', labelEn: 'Counterparty', labelKo: '체결처', type: 'text', required: true },
      { key: 'signDate', labelEn: 'Signing date', labelKo: '체결 예정일', type: 'date', required: true },
      { key: 'contractValue', labelEn: 'Contract value', labelKo: '계약 금액', type: 'money' },
      { key: 'purpose', labelEn: 'Purpose', labelKo: '목적', type: 'textarea', required: true },
    ],
  },
  {
    code: 'JP-SEAL-OTHER',
    nameEn: 'Seal Application (Other)',
    nameKo: '날인 신청서 (기타)',
    descriptionEn: 'Company seal for a non-sales document (押印申請・その他).',
    descriptionKo: '영업 외 문서 날인을 신청합니다 (押印申請・その他).',
    office: 'JP',
    category: 'DOCUMENT',
    icon: 'Stamp',
    titlePattern: '날인 신청 — {documentName} ({submitTo})',
    keywords: ["도장","날인","인감","직인","押印","捺印","seal","stamp"],
    sortOrder: 21,
    fields: [
      { key: 'documentName', labelEn: 'Document name', labelKo: '문서명', type: 'text', required: true },
      { key: 'submitTo', labelEn: 'Submitted to', labelKo: '제출처', type: 'text', required: true },
      { key: 'signDate', labelEn: 'Required by', labelKo: '필요일', type: 'date', required: true },
      { key: 'purpose', labelEn: 'Purpose', labelKo: '목적', type: 'textarea', required: true },
    ],
  },

  /* ----------------------------- TRAVEL ---------------------------- */
  {
    code: 'JP-TRIP-REQUEST',
    nameEn: 'Business Trip Request',
    nameKo: '출장 품의서',
    descriptionEn: 'Japanese office trip authorisation (出張伺書).',
    descriptionKo: '일본 지사 출장 품의서 (出張伺書).',
    office: 'JP',
    category: 'TRAVEL',
    icon: 'Plane',
    titlePattern: '출장 {place} {startDate} – {endDate}',
    amountField: 'estimatedCost',
    keywords: ["출장","품의","出張","trip request","business trip"],
    sortOrder: 30,
    fields: [
      { key: 'place', labelEn: 'Destination', labelKo: '출장지', type: 'text', required: true },
      { key: 'startDate', labelEn: 'From', labelKo: '시작일', type: 'date', required: true },
      { key: 'endDate', labelEn: 'To', labelKo: '종료일', type: 'date', required: true },
      { key: 'purpose', labelEn: 'Purpose', labelKo: '출장 목적', type: 'textarea', required: true },
      { key: 'estimatedCost', labelEn: 'Estimated cost', labelKo: '예상 비용', type: 'money' },
    ],
  },
  {
    code: 'JP-TRIP-PERDIEM',
    nameEn: 'Trip Per Diem Claim',
    nameKo: '출장 일당 신청서',
    descriptionEn: 'Monthly per-diem claim for trips taken (出張時日当申請書).',
    descriptionKo: '월별 출장 일당을 신청합니다 (出張時日当申請書).',
    office: 'JP',
    category: 'TRAVEL',
    icon: 'Coins',
    titlePattern: '{month} 출장 일당 — {days}일',
    amountField: 'totalAmount',
    keywords: ["일당","출장비","日当","per diem","perdiem","allowance"],
    sortOrder: 31,
    fields: [
      { key: 'month', labelEn: 'Month', labelKo: '대상 월', type: 'text', required: true, hintEn: 'YYYY/MM', hintKo: 'YYYY/MM' },
      { key: 'days', labelEn: 'Days claimed', labelKo: '신청 일수', type: 'number', required: true },
      { key: 'dailyRate', labelEn: 'Daily rate', labelKo: '1일 단가', type: 'money', required: true },
      { key: 'totalAmount', labelEn: 'Total', labelKo: '합계', type: 'money', required: true },
      { key: 'note', labelEn: 'Note', labelKo: '비고', type: 'textarea' },
    ],
  },
  {
    code: 'JP-TRIP-LODGING',
    nameEn: 'Trip Lodging Request',
    nameKo: '출장 숙박 신청서',
    descriptionEn: 'Accommodation booking for an approved trip.',
    descriptionKo: '승인된 출장의 숙박을 신청합니다.',
    office: 'JP',
    category: 'TRAVEL',
    icon: 'BedDouble',
    titlePattern: '숙박 {facility} {checkIn} – {checkOut}',
    amountField: 'totalAmount',
    keywords: ["숙박","호텔","宿泊","lodging","accommodation","hotel booking"],
    sortOrder: 32,
    fields: [
      { key: 'facility', labelEn: 'Facility', labelKo: '숙소명', type: 'text', required: true },
      { key: 'checkIn', labelEn: 'Check in', labelKo: '체크인', type: 'date', required: true },
      { key: 'checkOut', labelEn: 'Check out', labelKo: '체크아웃', type: 'date', required: true },
      { key: 'nights', labelEn: 'Nights', labelKo: '숙박일수', type: 'number', required: true },
      { key: 'totalAmount', labelEn: 'Total', labelKo: '총 금액', type: 'money', required: true },
    ],
  },

  /* ---------------------------- FINANCE ---------------------------- */
  {
    code: 'JP-EXPENSE-PRE',
    nameEn: 'Expense Pre-Approval',
    nameKo: '경비 사용 사전 신청서',
    descriptionEn: 'Authorisation to spend before the money moves (経費使用事前申請書).',
    descriptionKo: '지출 전 사전 승인을 받습니다 (経費使用事前申請書).',
    office: 'JP',
    category: 'FINANCE',
    icon: 'Wallet',
    titlePattern: '경비 사전 신청 — {item}',
    amountField: 'amount',
    keywords: ["사전","사전승인","경비","事前申請","pre-approval","preapproval"],
    sortOrder: 40,
    fields: [
      { key: 'item', labelEn: 'What', labelKo: '지출 항목', type: 'text', required: true },
      { key: 'amount', labelEn: 'Amount', labelKo: '금액', type: 'money', required: true },
      { key: 'spendDate', labelEn: 'Planned date', labelKo: '지출 예정일', type: 'date', required: true },
      { key: 'purpose', labelEn: 'Purpose', labelKo: '사용 목적', type: 'textarea', required: true },
    ],
  },
  {
    code: 'SETTLE-CC',
    nameEn: 'Corporate Card Settlement (C/C)',
    nameKo: '법인카드 정산 (C/C)',
    descriptionEn: 'Settlement of a corporate card payment to a facility.',
    descriptionKo: '법인카드 결제 건을 정산합니다.',
    office: null,
    category: 'FINANCE',
    icon: 'CreditCard',
    titlePattern: 'C/C {facilityName} — {bookingCode}',
    amountField: 'amount',
    keywords: ["법인카드","카드","결제","c/c","cc","corporate card","card settlement"],
    sortOrder: 41,
    fields: [
      { key: 'bookingCode', labelEn: 'Booking code', labelKo: '예약 코드', type: 'text', required: true },
      { key: 'facilityName', labelEn: 'Facility', labelKo: '시설명', type: 'text', required: true },
      { key: 'amount', labelEn: 'Amount', labelKo: '금액', type: 'money', required: true },
      { key: 'paidOn', labelEn: 'Payment date', labelKo: '결제일', type: 'date', required: true },
      { key: 'note', labelEn: 'Note', labelKo: '비고', type: 'textarea' },
    ],
  },
  {
    code: 'SETTLE-TR',
    nameEn: 'Transfer Request (T/R)',
    nameKo: '송금 요청 (T/R)',
    descriptionEn: 'Bank transfer to a facility against a booking.',
    descriptionKo: '예약 건에 대한 시설 송금을 요청합니다.',
    office: null,
    category: 'FINANCE',
    icon: 'Banknote',
    titlePattern: 'T/R {facilityName} — {bookingCode}',
    amountField: 'amount',
    keywords: ["송금","이체","입금","지급","t/r","tr","transfer","remit","remittance","wire"],
    sortOrder: 42,
    fields: [
      { key: 'bookingCode', labelEn: 'Booking code', labelKo: '예약 코드', type: 'text', required: true },
      { key: 'facilityName', labelEn: 'Facility', labelKo: '시설명', type: 'text', required: true },
      { key: 'amount', labelEn: 'Amount', labelKo: '송금액', type: 'money', required: true },
      { key: 'dueDate', labelEn: 'Transfer by', labelKo: '송금 기한', type: 'date', required: true },
      { key: 'bankAccount', labelEn: 'Bank account', labelKo: '입금 계좌', type: 'text', required: true },
      { key: 'note', labelEn: 'Note', labelKo: '비고', type: 'textarea' },
    ],
  },
  {
    code: 'JP-TR-DEPOSIT',
    nameEn: 'Floating Deposit (T/R)',
    nameKo: '보증금 송금 (T/R)',
    descriptionEn: 'Floating deposit transfer against a facility code.',
    descriptionKo: '시설 코드 기준 보증금을 송금합니다.',
    office: 'JP',
    category: 'FINANCE',
    icon: 'Landmark',
    titlePattern: 'T/R 보증금 {facilityName} ({facilityCode})',
    amountField: 'amount',
    keywords: ["보증금","디파짓","deposit","floating deposit"],
    sortOrder: 43,
    fields: [
      { key: 'facilityCode', labelEn: 'Facility code', labelKo: '시설 코드', type: 'text', required: true },
      { key: 'facilityName', labelEn: 'Facility name', labelKo: '시설명', type: 'text', required: true },
      { key: 'amount', labelEn: 'Deposit amount', labelKo: '보증금액', type: 'money', required: true },
      { key: 'dueDate', labelEn: 'Transfer by', labelKo: '송금 기한', type: 'date', required: true },
    ],
  },

  /* ----------------------------- GENERAL --------------------------- */
  {
    code: 'GEN-APPROVAL',
    nameEn: 'General Approval Request',
    nameKo: '일반 기안서',
    descriptionEn: 'Anything that needs a decision but has no dedicated form.',
    descriptionKo: '전용 양식이 없는 모든 결재 안건에 사용합니다.',
    office: null,
    category: 'GENERAL',
    icon: 'FileText',
    titlePattern: '{subject}',
    amountField: 'amount',
    keywords: ["기안","결재","승인","approval","general"],
    sortOrder: 90,
    fields: [
      { key: 'subject', labelEn: 'Subject', labelKo: '제목', type: 'text', required: true },
      { key: 'details', labelEn: 'Details', labelKo: '상세 내용', type: 'textarea', required: true },
      {
        key: 'amount',
        labelEn: 'Amount',
        labelKo: '금액',
        type: 'money',
        hintEn: 'Leave at zero if there is no cost.',
        hintKo: '비용이 없으면 0으로 두세요.',
      },
      { key: 'neededBy', labelEn: 'Needed by', labelKo: '필요일', type: 'date' },
    ],
  },
];
