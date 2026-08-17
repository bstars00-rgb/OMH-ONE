/**
 * Static reference data for the demo dataset.
 *
 * PROTOTYPE DATA — every person, vendor and amount below is fictional and exists
 * only to make the prototype behave like a live system. No real employee or
 * supplier information is present.
 */

export const OFFICES = [
  { code: 'VN', name: 'Vietnam Office', country: 'Vietnam', city: 'Ho Chi Minh City', timezone: 'Asia/Ho_Chi_Minh', baseCurrency: 'USD' },
  { code: 'KR', name: 'Korea Office', country: 'Korea', city: 'Seoul', timezone: 'Asia/Seoul', baseCurrency: 'USD' },
  { code: 'SG', name: 'Singapore Office', country: 'Singapore', city: 'Singapore', timezone: 'Asia/Singapore', baseCurrency: 'USD' },
  // JP and CN carry no seeded staff yet, but they exist because their form
  // templates do — 押印申請 and 出張伺書 are Japan-only documents, and an
  // office-scoped template needs a real office to hang from.
  { code: 'JP', name: 'Japan Office', country: 'Japan', city: 'Tokyo', timezone: 'Asia/Tokyo', baseCurrency: 'USD' },
  { code: 'CN', name: 'China Office', country: 'China', city: 'Shanghai', timezone: 'Asia/Shanghai', baseCurrency: 'USD' },
] as const;

export const DEPARTMENTS = [
  { code: 'CEO', name: 'CEO Office', office: 'VN' },
  { code: 'SCM', name: 'Supply Chain Management', office: 'VN' },
  { code: 'GSM', name: 'Global Sales & Marketing', office: 'KR' },
  { code: 'OP', name: 'Operations', office: 'VN' },
  { code: 'CT', name: 'Content Team', office: 'VN' },
  { code: 'IT', name: 'Information Technology', office: 'VN' },
  { code: 'FIN', name: 'Finance', office: 'VN' },
  { code: 'HR', name: 'Human Resources', office: 'VN' },
] as const;

export const TEAMS = [
  { code: 'SCM-SRC', name: 'Sourcing', department: 'SCM' },
  { code: 'SCM-CTR', name: 'Contracting', department: 'SCM' },
  { code: 'GSM-APAC', name: 'APAC Sales', department: 'GSM' },
  { code: 'OP-RES', name: 'Reservations', department: 'OP' },
  { code: 'OP-SUP', name: 'Support', department: 'OP' },
  { code: 'CT-PROD', name: 'Content Production', department: 'CT' },
  { code: 'IT-PLT', name: 'Platform', department: 'IT' },
] as const;

export const COST_CENTERS = [
  { code: 'CC-CEO', name: 'Executive', department: 'CEO' },
  { code: 'CC-SCM', name: 'Supply Chain', department: 'SCM' },
  { code: 'CC-GSM', name: 'Sales & Marketing', department: 'GSM' },
  { code: 'CC-OP', name: 'Operations', department: 'OP' },
  { code: 'CC-CT', name: 'Content', department: 'CT' },
  { code: 'CC-IT', name: 'Technology', department: 'IT' },
  { code: 'CC-FIN', name: 'Finance & Admin', department: 'FIN' },
  { code: 'CC-HR', name: 'People', department: 'HR' },
] as const;

export interface SeedEmployee {
  code: string;
  name: string;
  englishName?: string;
  email: string;
  department: string;
  team?: string;
  office: string;
  position: string;
  managerCode: string | null;
  isDeptHead?: boolean;
  joinDate: string;
  allowance: number;
  /** Login roles. Employees without an entry still get an account as EMPLOYEE. */
  roles?: string[];
  primaryRole?: string;
  /**
   * Executives approve; they do not file requests.
   *
   * The system does not forbid it — an executive who genuinely needs to submit
   * something can, and the "새 기안" button is still there for them. This flag
   * only keeps them out of the demo's requester pool, so seeded history reads
   * the way the company actually works: the CEO's name appears on approvals,
   * never as the person asking.
   */
  isExecutive?: boolean;
}

/** 31 fictional employees across 8 departments and 3 offices. */
export const EMPLOYEES: SeedEmployee[] = [
  // CEO Office
  { code: 'E001', name: 'Jackie Lee', email: 'jackie@ohmyhotel.com', department: 'CEO', office: 'VN', position: 'Managing Director', managerCode: null, isDeptHead: true, isExecutive: true, joinDate: '2019-03-04', allowance: 20, primaryRole: 'DIRECTOR', roles: ['DIRECTOR'] },
  { code: 'E002', name: 'Sophia Yun', email: 'sophia.yun@ohmyhotel.com', department: 'CEO', office: 'VN', position: 'Executive Assistant', managerCode: 'E001', joinDate: '2021-06-14', allowance: 15 },
  // Approves the CTO step. Deliberately not the IT department head: that role
  // resolves DEPT_HEAD routing for IT staff and belongs to the IT Manager.
  { code: 'E003', name: 'Daniel Cho', email: 'daniel.cho@ohmyhotel.com', department: 'CEO', office: 'VN', position: 'Chief Technology Officer', managerCode: 'E001', isExecutive: true, joinDate: '2019-05-20', allowance: 20, primaryRole: 'DIRECTOR', roles: ['DIRECTOR'] },

  // SCM
  { code: 'E010', name: 'Vicky Nguyen', email: 'vicky@ohmyhotel.com', department: 'SCM', team: 'SCM-CTR', office: 'VN', position: 'SCM Manager', managerCode: 'E001', isDeptHead: true, joinDate: '2020-01-13', allowance: 18, primaryRole: 'MANAGER', roles: ['MANAGER'] },
  { code: 'E011', name: 'Sang Lee', email: 'sang.lee@ohmyhotel.com', department: 'SCM', team: 'SCM-SRC', office: 'KR', position: 'Senior SCM Specialist', managerCode: 'E010', joinDate: '2020-09-01', allowance: 17 },
  { code: 'E012', name: 'Bryant Vo', email: 'employee@ohmyhotel.com', department: 'SCM', team: 'SCM-SRC', office: 'VN', position: 'SCM Specialist', managerCode: 'E010', joinDate: '2022-04-11', allowance: 15 },
  { code: 'E013', name: 'Linh Tran', email: 'linh.tran@ohmyhotel.com', department: 'SCM', team: 'SCM-CTR', office: 'VN', position: 'SCM Specialist', managerCode: 'E010', joinDate: '2023-02-06', allowance: 15 },
  { code: 'E014', name: 'Karl Weber', email: 'karl.weber@ohmyhotel.com', department: 'SCM', team: 'SCM-SRC', office: 'SG', position: 'SCM Analyst', managerCode: 'E010', joinDate: '2023-08-21', allowance: 15 },

  // GSM
  { code: 'E020', name: 'Jane Kim', email: 'jane.kim@ohmyhotel.com', department: 'GSM', team: 'GSM-APAC', office: 'KR', position: 'GSM Manager', managerCode: 'E001', isDeptHead: true, joinDate: '2019-11-04', allowance: 18, primaryRole: 'MANAGER', roles: ['MANAGER'] },
  { code: 'E021', name: 'Nathan Cho', email: 'nathan.cho@ohmyhotel.com', department: 'GSM', team: 'GSM-APAC', office: 'KR', position: 'Sales Specialist', managerCode: 'E020', joinDate: '2021-03-15', allowance: 16 },
  { code: 'E022', name: 'Trish Bui', email: 'trish.bui@ohmyhotel.com', department: 'GSM', team: 'GSM-APAC', office: 'VN', position: 'Marketing Specialist', managerCode: 'E020', joinDate: '2022-07-18', allowance: 15 },
  { code: 'E023', name: 'Marco Silva', email: 'marco.silva@ohmyhotel.com', department: 'GSM', team: 'GSM-APAC', office: 'SG', position: 'Partnership Manager', managerCode: 'E020', joinDate: '2021-10-04', allowance: 16 },

  // OP
  { code: 'E030', name: 'Grace Do', email: 'grace.do@ohmyhotel.com', department: 'OP', team: 'OP-RES', office: 'VN', position: 'Operations Manager', managerCode: 'E001', isDeptHead: true, joinDate: '2019-08-19', allowance: 18, primaryRole: 'MANAGER', roles: ['MANAGER'] },
  { code: 'E031', name: 'Peter Han', email: 'peter.han@ohmyhotel.com', department: 'OP', team: 'OP-RES', office: 'VN', position: 'Operations Supervisor', managerCode: 'E030', joinDate: '2020-05-11', allowance: 16 },
  { code: 'E032', name: 'Juno Park', email: 'juno.park@ohmyhotel.com', department: 'OP', team: 'OP-SUP', office: 'KR', position: 'Operations Specialist', managerCode: 'E030', joinDate: '2022-01-10', allowance: 15 },
  { code: 'E033', name: 'Mai Pham', email: 'mai.pham@ohmyhotel.com', department: 'OP', team: 'OP-RES', office: 'VN', position: 'Reservations Specialist', managerCode: 'E030', joinDate: '2023-03-13', allowance: 15 },
  { code: 'E034', name: 'Daniel Ng', email: 'daniel.ng@ohmyhotel.com', department: 'OP', team: 'OP-SUP', office: 'SG', position: 'Support Specialist', managerCode: 'E030', joinDate: '2023-11-06', allowance: 15 },

  // CT
  { code: 'E040', name: 'Calvin Ha', email: 'calvin.ha@ohmyhotel.com', department: 'CT', team: 'CT-PROD', office: 'VN', position: 'Content Manager', managerCode: 'E001', isDeptHead: true, joinDate: '2020-02-17', allowance: 18, primaryRole: 'MANAGER', roles: ['MANAGER'] },
  { code: 'E041', name: 'Joa Seo', email: 'joa.seo@ohmyhotel.com', department: 'CT', team: 'CT-PROD', office: 'KR', position: 'Content Lead', managerCode: 'E040', joinDate: '2021-01-11', allowance: 16 },
  { code: 'E042', name: 'Yuki Tanaka', email: 'yuki.tanaka@ohmyhotel.com', department: 'CT', team: 'CT-PROD', office: 'VN', position: 'Content Specialist', managerCode: 'E040', joinDate: '2022-09-05', allowance: 15 },
  { code: 'E043', name: 'Hana Lim', email: 'hana.lim@ohmyhotel.com', department: 'CT', team: 'CT-PROD', office: 'KR', position: 'Content Specialist', managerCode: 'E040', joinDate: '2023-05-15', allowance: 15 },
  { code: 'E044', name: 'Duy Nguyen', email: 'duy.nguyen@ohmyhotel.com', department: 'CT', team: 'CT-PROD', office: 'VN', position: 'Content Specialist', managerCode: 'E040', joinDate: '2024-01-08', allowance: 15 },

  // IT
  { code: 'E050', name: 'Ethan Park', email: 'admin@ohmyhotel.com', department: 'IT', team: 'IT-PLT', office: 'VN', position: 'IT Manager', managerCode: 'E001', isDeptHead: true, joinDate: '2019-06-03', allowance: 18, primaryRole: 'SUPER_ADMIN', roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER'] },
  { code: 'E051', name: 'Tuan Le', email: 'tuan.le@ohmyhotel.com', department: 'IT', team: 'IT-PLT', office: 'VN', position: 'System Engineer', managerCode: 'E050', joinDate: '2021-08-16', allowance: 16 },
  { code: 'E052', name: 'Priya Raman', email: 'priya.raman@ohmyhotel.com', department: 'IT', team: 'IT-PLT', office: 'SG', position: 'Software Engineer', managerCode: 'E050', joinDate: '2022-11-14', allowance: 15 },

  // FIN
  { code: 'E060', name: 'Olivia Chen', email: 'finance@ohmyhotel.com', department: 'FIN', office: 'VN', position: 'Finance Manager', managerCode: 'E001', isDeptHead: true, joinDate: '2019-09-16', allowance: 18, primaryRole: 'FINANCE', roles: ['FINANCE', 'MANAGER'] },
  { code: 'E061', name: 'Henry Dao', email: 'henry.dao@ohmyhotel.com', department: 'FIN', office: 'VN', position: 'Accountant', managerCode: 'E060', joinDate: '2021-05-10', allowance: 16 },
  { code: 'E062', name: 'Sena Ko', email: 'auditor@ohmyhotel.com', department: 'FIN', office: 'KR', position: 'Financial Analyst', managerCode: 'E060', joinDate: '2022-02-14', allowance: 15, primaryRole: 'AUDITOR', roles: ['AUDITOR'] },

  // HR
  { code: 'E070', name: 'Mia Song', email: 'mia@ohmyhotel.com', department: 'HR', office: 'VN', position: 'HR Manager', managerCode: 'E001', isDeptHead: true, joinDate: '2019-04-15', allowance: 18, primaryRole: 'HR', roles: ['HR', 'MANAGER'] },
  { code: 'E071', name: 'Rosa Vu', email: 'rosa.vu@ohmyhotel.com', department: 'HR', office: 'VN', position: 'HR Specialist', managerCode: 'E070', joinDate: '2022-03-07', allowance: 15 },
  { code: 'E072', name: 'Emily Tan', email: 'emily.tan@ohmyhotel.com', department: 'HR', office: 'SG', position: 'HR Specialist', managerCode: 'E070', joinDate: '2023-07-03', allowance: 15 },
];

export const VENDORS = [
  { code: 'V001', name: 'Saigon Tech Supply', category: 'IT', country: 'Vietnam', contactName: 'Hoang Minh', contactEmail: 'sales@saigontech.example', rating: 4, isPreferred: true },
  { code: 'V002', name: 'Nordic Furniture Co.', category: 'OFFICE', country: 'Singapore', contactName: 'Lena Aas', contactEmail: 'orders@nordicfurniture.example', rating: 4, isPreferred: false },
  { code: 'V003', name: 'Seoul Digital Print', category: 'MARKETING', country: 'Korea', contactName: 'Park Ji', contactEmail: 'hello@seouldigital.example', rating: 3, isPreferred: false },
  { code: 'V004', name: 'CloudNine Software', category: 'SOFTWARE', country: 'Singapore', contactName: 'Ravi Menon', contactEmail: 'billing@cloudnine.example', rating: 5, isPreferred: true },
  { code: 'V005', name: 'Mekong Logistics', category: 'SERVICE', country: 'Vietnam', contactName: 'Tran Bao', contactEmail: 'ops@mekonglog.example', rating: 4, isPreferred: true },
  { code: 'V006', name: 'Hanoi Office Depot', category: 'OFFICE', country: 'Vietnam', contactName: 'Nguyen Thu', contactEmail: 'sales@hanoidepot.example', rating: 3, isPreferred: false },
  { code: 'V007', name: 'Lion City Events', category: 'MARKETING', country: 'Singapore', contactName: 'Chloe Sim', contactEmail: 'events@lioncity.example', rating: 4, isPreferred: false },
  { code: 'V008', name: 'Busan Hardware', category: 'IT', country: 'Korea', contactName: 'Kim Doyun', contactEmail: 'sales@busanhw.example', rating: 3, isPreferred: false },
  { code: 'V009', name: 'Delta Travel Agency', category: 'SERVICE', country: 'Vietnam', contactName: 'Pham Anh', contactEmail: 'corporate@deltatravel.example', rating: 4, isPreferred: true },
  { code: 'V010', name: 'BrightPixel Studio', category: 'MARKETING', country: 'Vietnam', contactName: 'Le Quang', contactEmail: 'studio@brightpixel.example', rating: 5, isPreferred: true },
  { code: 'V011', name: 'SecureNet Systems', category: 'IT', country: 'Singapore', contactName: 'Adrian Goh', contactEmail: 'enquiry@securenet.example', rating: 4, isPreferred: false },
  { code: 'V012', name: 'Gangnam Catering', category: 'SERVICE', country: 'Korea', contactName: 'Choi Eun', contactEmail: 'book@gangnamcater.example', rating: 3, isPreferred: false },
  { code: 'V013', name: 'Pacific Print House', category: 'OFFICE', country: 'Singapore', contactName: 'Wei Ling', contactEmail: 'print@pacifichouse.example', rating: 3, isPreferred: false },
  { code: 'V014', name: 'Atlas Data Analytics', category: 'SOFTWARE', country: 'Korea', contactName: 'Yoon Sae', contactEmail: 'sales@atlasdata.example', rating: 4, isPreferred: false },
  { code: 'V015', name: 'Green Leaf Facilities', category: 'SERVICE', country: 'Vietnam', contactName: 'Vo Ha', contactEmail: 'contact@greenleaf.example', rating: 4, isPreferred: true },
] as const;

/**
 * Approval routes. `conditionType` gates a step: a step only materializes for a
 * request when its condition holds, which is how "over $1,000 also needs the
 * Director" is expressed without hard-coding branches in the engine.
 */
export const WORKFLOWS = [
  {
    name: 'Annual Leave — standard',
    requestType: 'LEAVE',
    description: 'Manager confirms team coverage, HR verifies the leave balance.',
    steps: [
      { name: 'Line Manager', approverRole: 'MANAGER', slaHours: 24, conditionType: 'ALWAYS' },
      { name: 'HR Review', approverRole: 'HR', slaHours: 24, conditionType: 'ALWAYS' },
      { name: 'Director Approval', approverRole: 'DIRECTOR', slaHours: 48, conditionType: 'DAYS_GT', conditionValue: 7 },
    ],
  },
  {
    name: 'Business Trip — standard',
    requestType: 'BUSINESS_TRIP',
    description: 'Director sign-off is required for international travel or trips above $1,000.',
    steps: [
      { name: 'Line Manager', approverRole: 'MANAGER', slaHours: 24, conditionType: 'ALWAYS' },
      { name: 'Department Head', approverRole: 'DEPT_HEAD', slaHours: 24, conditionType: 'AMOUNT_GT', conditionValue: 500 },
      { name: 'Director Approval', approverRole: 'DIRECTOR', slaHours: 48, conditionType: 'INTERNATIONAL' },
    ],
  },
  {
    name: 'Purchase Request — standard',
    requestType: 'PURCHASE',
    description: 'Finance validates budget; Director approves spend above $1,000.',
    steps: [
      { name: 'Department Head', approverRole: 'DEPT_HEAD', slaHours: 24, conditionType: 'ALWAYS' },
      { name: 'Finance Review', approverRole: 'FINANCE', slaHours: 36, conditionType: 'ALWAYS' },
      { name: 'Director Approval', approverRole: 'DIRECTOR', slaHours: 48, conditionType: 'AMOUNT_GT', conditionValue: 1000 },
    ],
  },
  {
    name: 'Expense Claim — standard',
    requestType: 'EXPENSE',
    description: 'Small claims stop at the manager; Finance reviews anything above $50.',
    steps: [
      { name: 'Line Manager', approverRole: 'MANAGER', slaHours: 24, conditionType: 'ALWAYS' },
      { name: 'Finance Review', approverRole: 'FINANCE', slaHours: 36, conditionType: 'AMOUNT_GT', conditionValue: 50 },
    ],
  },
  {
    name: 'HR Request — standard',
    requestType: 'HR',
    description: 'Routed straight to HR, with manager awareness.',
    steps: [
      { name: 'Line Manager', approverRole: 'MANAGER', slaHours: 24, conditionType: 'ALWAYS' },
      { name: 'HR Review', approverRole: 'HR', slaHours: 48, conditionType: 'ALWAYS' },
    ],
  },
  {
    name: 'General Approval — standard',
    requestType: 'GENERAL',
    description: 'Manager, then Director for anything with financial impact above $1,000.',
    steps: [
      { name: 'Line Manager', approverRole: 'MANAGER', slaHours: 24, conditionType: 'ALWAYS' },
      { name: 'Director Approval', approverRole: 'DIRECTOR', slaHours: 48, conditionType: 'AMOUNT_GT', conditionValue: 1000 },
    ],
  },
] as const;

export const POLICIES = [
  { code: 'POL-HOTEL', name: 'Hotel rate cap', appliesTo: 'BUSINESS_TRIP', metric: 'HOTEL_PER_NIGHT', operator: 'LTE', threshold: 150, severity: 'WARNING', message: 'Hotel rate should not exceed $150 per night. Above this, an approver must record a justification.' },
  { code: 'POL-MEAL', name: 'Meal allowance', appliesTo: 'EXPENSE', metric: 'MEAL_PER_DAY', operator: 'LTE', threshold: 50, severity: 'WARNING', message: 'Meal expenses should not exceed $50 per day per traveller.' },
  { code: 'POL-FLIGHT', name: 'Flight class', appliesTo: 'BUSINESS_TRIP', metric: 'FLIGHT_CLASS', operator: 'EQ', thresholdText: 'ECONOMY', severity: 'WARNING', message: 'Economy class is the default for all flights under 6 hours.' },
  { code: 'POL-PR-QUOTE', name: 'Two quotations above $3,000', appliesTo: 'PURCHASE', metric: 'PR_TOTAL', operator: 'REQUIRES', threshold: 3000, severity: 'BLOCKING', message: 'Purchase requests above $3,000 require at least two quotations before Finance review.' },
  { code: 'POL-LEAVE-RUN', name: 'Consecutive leave limit', appliesTo: 'LEAVE', metric: 'LEAVE_CONSECUTIVE', operator: 'LTE', threshold: 10, severity: 'WARNING', message: 'More than 10 consecutive working days of leave requires Director approval.' },
  // One row per request type the rule applies to — `applies_to` is single-valued,
  // and budget discipline matters as much for travel and expenses as for purchasing.
  { code: 'POL-BUDGET-PR', name: 'Department budget', appliesTo: 'PURCHASE', metric: 'BUDGET_REMAINING', operator: 'GTE', threshold: 0, severity: 'BLOCKING', message: 'A request may not exceed the remaining department budget for the quarter.' },
  { code: 'POL-BUDGET-BT', name: 'Travel budget', appliesTo: 'BUSINESS_TRIP', metric: 'BUDGET_REMAINING', operator: 'GTE', threshold: 0, severity: 'WARNING', message: 'Travel above the remaining quarterly travel budget needs Director sign-off.' },
  { code: 'POL-BUDGET-EX', name: 'Travel budget', appliesTo: 'EXPENSE', metric: 'BUDGET_REMAINING', operator: 'GTE', threshold: 0, severity: 'WARNING', message: 'Claims above the remaining quarterly budget need Finance review.' },
] as const;

/** Public holidays used by the working-day calculator. */
export const HOLIDAY_TEMPLATE: { md: string; name: string; office: string | null }[] = [
  { md: '01-01', name: "New Year's Day", office: null },
  { md: '04-30', name: 'Reunification Day', office: 'VN' },
  { md: '05-01', name: 'International Labour Day', office: null },
  { md: '09-02', name: 'National Day', office: 'VN' },
  { md: '03-01', name: 'Independence Movement Day', office: 'KR' },
  { md: '08-15', name: 'Liberation Day', office: 'KR' },
  { md: '10-03', name: 'National Foundation Day', office: 'KR' },
  { md: '08-09', name: 'National Day', office: 'SG' },
  { md: '12-25', name: 'Christmas Day', office: null },
];

export const TRIP_DESTINATIONS = [
  { country: 'Korea', city: 'Seoul', international: true, flightCost: 520, hotelRate: 145, transport: 90, meal: 55 },
  { country: 'Singapore', city: 'Singapore', international: true, flightCost: 310, hotelRate: 190, transport: 70, meal: 60 },
  { country: 'Japan', city: 'Tokyo', international: true, flightCost: 610, hotelRate: 165, transport: 85, meal: 65 },
  { country: 'India', city: 'Mumbai', international: true, flightCost: 480, hotelRate: 120, transport: 60, meal: 40 },
  { country: 'Thailand', city: 'Bangkok', international: true, flightCost: 220, hotelRate: 95, transport: 45, meal: 35 },
  { country: 'Vietnam', city: 'Hanoi', international: false, flightCost: 95, hotelRate: 70, transport: 30, meal: 25 },
  { country: 'Vietnam', city: 'Da Nang', international: false, flightCost: 80, hotelRate: 65, transport: 28, meal: 25 },
];

export const TRIP_PURPOSES = [
  { purpose: 'Partner hotel contracting round', event: 'Q3 Contracting Review' },
  { purpose: 'Attend industry trade show and meet suppliers', event: 'ITB Asia' },
  { purpose: 'Team study at Korea office and AI workshop', event: 'AI Challenge Workshop' },
  { purpose: 'On-site operations support during peak season', event: null },
  { purpose: 'Quarterly business review with regional partners', event: 'QBR' },
  { purpose: 'New market inspection and hotel site visits', event: null },
  { purpose: 'Marketing campaign shoot with partner property', event: null },
];

/**
 * `depts` keeps procurement plausible: the Content Team does not order warehouse
 * racking, and Finance does not buy trade-show booths. The seed picks a requester
 * from these departments, which is what makes the department spend charts read
 * like a real company rather than noise.
 */
export const PURCHASE_ITEMS_POOL = [
  { name: 'MacBook Pro 14"', category: 'IT', unit: 1130, prevUnit: 920, vendor: 'V001', maxQty: 3, depts: ['IT', 'CT', 'GSM', 'SCM', 'OP', 'FIN', 'HR', 'CEO'] },
  { name: 'Dell UltraSharp 27" Monitor', category: 'IT', unit: 340, prevUnit: 330, vendor: 'V001', maxQty: 4, depts: ['IT', 'CT', 'OP', 'SCM'] },
  { name: 'Ergonomic office chair', category: 'OFFICE', unit: 215, prevUnit: 205, vendor: 'V002', maxQty: 6, depts: ['HR', 'OP', 'FIN', 'IT'] },
  { name: 'Standing desk', category: 'OFFICE', unit: 480, prevUnit: 460, vendor: 'V002', maxQty: 3, depts: ['HR', 'IT', 'OP'] },
  { name: 'Figma Organization seats (annual)', category: 'SOFTWARE', unit: 540, prevUnit: 540, vendor: 'V004', maxQty: 2, depts: ['CT', 'IT'] },
  { name: 'Atlas Analytics licence (annual)', category: 'SOFTWARE', unit: 2400, prevUnit: 2100, vendor: 'V014', maxQty: 1, depts: ['IT', 'FIN', 'GSM'] },
  { name: 'Trade show booth package', category: 'MARKETING', unit: 4200, prevUnit: 3900, vendor: 'V007', maxQty: 1, depts: ['GSM'] },
  { name: 'Brochure printing (5,000 units)', category: 'MARKETING', unit: 860, prevUnit: 820, vendor: 'V003', maxQty: 2, depts: ['GSM', 'CT'] },
  { name: 'Office network switch', category: 'IT', unit: 390, prevUnit: 380, vendor: 'V011', maxQty: 2, depts: ['IT'] },
  { name: 'Photography production day', category: 'MARKETING', unit: 1250, prevUnit: 1180, vendor: 'V010', maxQty: 2, depts: ['CT', 'GSM'] },
  { name: 'Warehouse pallet racking', category: 'SERVICE', unit: 1750, prevUnit: 1700, vendor: 'V005', maxQty: 1, depts: ['SCM'] },
  { name: 'Office cleaning contract (quarterly)', category: 'SERVICE', unit: 900, prevUnit: 880, vendor: 'V015', maxQty: 1, depts: ['HR', 'OP'] },
  { name: 'Conference room display', category: 'IT', unit: 1080, prevUnit: 1020, vendor: 'V008', maxQty: 1, depts: ['IT', 'CEO'] },
  { name: 'Team offsite catering', category: 'SERVICE', unit: 640, prevUnit: 600, vendor: 'V012', maxQty: 2, depts: ['HR', 'OP', 'CT', 'GSM'] },
  { name: 'Branded merchandise pack', category: 'OFFICE', unit: 520, prevUnit: 500, vendor: 'V013', maxQty: 3, depts: ['GSM', 'HR', 'CT'] },
];

export const EXPENSE_MERCHANTS: Record<string, string[]> = {
  HOTEL: ['Lotte Hotel Seoul', 'Marina Bay Sands', 'Novotel Saigon', 'Hotel Nikko', 'Grand Hyatt Mumbai'],
  FLIGHT: ['Vietnam Airlines', 'Korean Air', 'Singapore Airlines', 'Vietjet Air'],
  MEAL: ['Gangnam Gogi House', 'Pho 2000', 'Din Tai Fung', 'Maxwell Food Centre', 'Sushi Zanmai'],
  TRAVEL: ['Grab', 'Kakao T', 'Seoul Metro', 'ComfortDelGro'],
  MARKETING: ['Meta Ads', 'Google Ads', 'Seoul Digital Print'],
  OFFICE: ['Hanoi Office Depot', 'Saigon Tech Supply'],
  ENTERTAINMENT: ['The Deck Saigon', 'Smoke & Mirrors', 'Jungsik'],
  SOFTWARE: ['CloudNine Software', 'Figma', 'Atlas Data Analytics'],
  OTHER: ['Vietnam Post', 'DHL Express'],
};

export const HR_REQUEST_KINDS = [
  { category: 'Employment certificate', details: 'Employment certificate required for a personal visa application.' },
  { category: 'Work-from-home arrangement', details: 'Request to work remotely two days per week for one quarter.' },
  { category: 'Training sponsorship', details: 'Request sponsorship for a revenue-management certification course.' },
  { category: 'Equipment replacement', details: 'Laptop battery is degraded; requesting replacement under the IT refresh policy.' },
  { category: 'Contract amendment', details: 'Request to update job title following an internal role change.' },
  { category: 'Parental leave planning', details: 'Advance notice and planning for parental leave next quarter.' },
];

export const GENERAL_REQUEST_KINDS = [
  { title: 'Partner NDA signature request', details: 'Non-disclosure agreement with a new distribution partner. Legal review completed, signature required.', amount: 0 },
  { title: 'Annual insurance renewal', details: 'Renewal of the office liability insurance policy for the Vietnam office.', amount: 3200 },
  { title: 'Company outing budget approval', details: 'Annual team-building outing for the Operations department, 24 participants.', amount: 2600 },
  { title: 'Website domain renewal (3 years)', details: 'Renewal of primary and regional domains for three years.', amount: 780 },
  { title: 'Membership: Vietnam Tourism Association', details: 'Annual corporate membership renewal, includes two event passes.', amount: 1450 },
  { title: 'Office lease deposit adjustment', details: 'Landlord requests a deposit adjustment following the lease extension.', amount: 5400 },
  { title: 'Translation service agreement', details: 'Framework agreement for Korean and Japanese content translation.', amount: 1900 },
  { title: 'Charity donation — flood relief', details: 'Company donation to the central Vietnam flood relief fund.', amount: 1000 },
];
