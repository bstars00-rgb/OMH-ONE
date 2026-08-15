import type { TemplateField } from '@/lib/validation/templates';

/**
 * Turns a description — or a pasted copy of an existing paper form — into a
 * template draft.
 *
 * The pasted-form path is the one that matters. A company adopting this has
 * twenty-odd forms already written down; retyping each as field definitions is
 * the actual migration cost, and it is exactly the work a machine should do.
 * Describing a form from scratch is the rarer case.
 *
 * Nothing here is authoritative: the output is a *draft* the administrator
 * reviews and edits before publishing. That is why it guesses generously rather
 * than declining — a wrong field is one click to delete, a missing one is
 * retyping.
 */

export interface TemplateDraft {
  /** Suggested code, always identifier-shaped even for a CJK form name. */
  code: string;
  nameEn: string;
  nameKo: string;
  descriptionEn: string;
  descriptionKo: string;
  category: 'HR' | 'FINANCE' | 'TRAVEL' | 'DOCUMENT' | 'GENERAL';
  icon: string;
  fields: TemplateField[];
  keywords: string[];
  titlePattern: string;
  amountField: string | null;
  officeCode: string | null;
  /** What the generator inferred rather than read, so the reviewer knows where to look. */
  notes: string[];
}

/* ------------------------------------------------------------------ */
/* Vocabulary                                                          */
/* ------------------------------------------------------------------ */

const CATEGORY_HINTS: { category: TemplateDraft['category']; icon: string; terms: string[] }[] = [
  {
    category: 'HR',
    icon: 'Users',
    terms: ['휴가', '연차', '사직', '퇴사', '퇴직', '인사', '근태', '지각', '조퇴', '결근', '출산', '육아', '채용', '교육',
            '退職', '休暇', '欠勤', '遅刻', '早退', '産休', '育児', '入社', '人事', '勤続', '辞職',
            'leave', 'resign', 'retire', 'hr', 'attendance', 'maternity', 'training', 'hire'],
  },
  {
    category: 'FINANCE',
    icon: 'Wallet',
    terms: ['경비', '지출', '정산', '송금', '이체', '카드', '결제', '보증금', '예산', '비용', '급여', '청구',
            '経費', '精算', '振込', '支払', '請求', '立替', '予算', '給与', '費用', '入金', '報酬',
            'expense', 'settlement', 'transfer', 'payment', 'card', 'deposit', 'budget', 'invoice', 'payroll'],
  },
  {
    category: 'TRAVEL',
    icon: 'Plane',
    terms: ['출장', '숙박', '항공', '일당', '교통', '出張', '宿泊', '航空', '日当', '交通', '旅費',
            'trip', 'travel', 'lodging', 'flight', 'accommodation', 'per diem'],
  },
  {
    category: 'DOCUMENT',
    icon: 'Stamp',
    terms: ['날인', '도장', '인감', '직인', '계약', '협약', '문서', '증명',
            '押印', '捺印', '契約', '文書', '証明', '稟議', '協定',
            'seal', 'stamp', 'contract', 'agreement', 'certificate'],
  },
];

const OFFICE_HINTS: { code: string; terms: string[] }[] = [
  { code: 'JP', terms: ['일본', '도쿄', '오사카', 'japan', 'tokyo', 'osaka', 'jp', '日本'] },
  { code: 'KR', terms: ['한국', '서울', 'korea', 'seoul', 'kr'] },
  { code: 'SG', terms: ['싱가포르', 'singapore', 'sg'] },
  { code: 'CN', terms: ['중국', '상하이', 'china', 'shanghai', 'cn'] },
  { code: 'VN', terms: ['베트남', '호치민', 'vietnam', 'ho chi minh', 'vn'] },
];

/** Label patterns → field type. Order matters: the first match wins. */
const TYPE_HINTS: { type: TemplateField['type']; terms: string[] }[] = [
  { type: 'date', terms: ['일자', '날짜', '일시', '기한', '예정일', '시작일', '종료일', '입사일', '퇴사일', '체결일',
                          '日付', '期限', '予定日', '開始日', '終了日', '退職日', '入社日', '締結日',
                          'date', 'deadline', 'when'] },
  { type: 'money', terms: ['금액', '비용', '단가', '요금', '합계', '총액', '보증금', '급여', '가격',
                           '金額', '費用', '単価', '料金', '合計', '総額', '敷金', '給与', '価格', '報酬',
                           'amount', 'cost', 'price', 'total', 'fee', 'salary', 'deposit'] },
  { type: 'number', terms: ['수량', '일수', '개수', '횟수', '인원', '시간',
                            '数量', '年数', '日数', '人数', '回数', '泊数', '時間',
                            'quantity', 'count', 'days', 'nights', 'hours', 'years'] },
  { type: 'employee', terms: ['담당자', '인수자', '대상자', '승계', '동행',
                              '担当者', '対象者', '後任', '同行者',
                              'assignee', 'successor', 'handover', 'colleague'] },
  { type: 'textarea', terms: ['사유', '목적', '내용', '설명', '비고', '상세', '경위',
                              '理由', '目的', '内容', '説明', '備考', '詳細', '経緯', '摘要',
                              'reason', 'purpose', 'detail', 'description', 'note', 'remark', 'comment'] },
];

/* ------------------------------------------------------------------ */
/* Entry point                                                         */
/* ------------------------------------------------------------------ */

export function draftTemplate(input: string): TemplateDraft {
  const text = input.trim();
  const lower = text.toLowerCase();
  const notes: string[] = [];

  const category = detectCategory(lower);
  const officeCode = detectOffice(lower);

  // Multi-line input with label-shaped lines is a pasted form; a single
  // sentence is a description. The distinction drives everything below.
  const parsedFields = parseFormLines(text);
  const pasted = parsedFields.length >= 2;

  const fields = pasted ? parsedFields : skeletonFor(category.category);
  if (!pasted) notes.push('tplGen.note.skeleton');
  else notes.push('tplGen.note.parsed');

  const name = deriveName(text, pasted);
  const amountField = fields.find((f) => f.type === 'money')?.key ?? null;
  if (amountField) notes.push('tplGen.note.amount');

  // The first two short fields make a title that identifies the document at a
  // glance in an inbox — which is the whole job of a title.
  const titleParts = fields
    .filter((f) => f.type !== 'textarea' && f.type !== 'checkbox')
    .slice(0, 2)
    .map((f) => `{${f.key}}`);
  const titlePattern = titleParts.length ? `${name.ko} — ${titleParts.join(' ')}` : name.ko;

  return {
    code: suggestCode(name.en, category.category, officeCode),
    nameEn: name.en,
    nameKo: name.ko,
    descriptionEn: `Generated from ${pasted ? 'a pasted form' : 'a description'}. Review before publishing.`,
    descriptionKo: `${pasted ? '붙여넣은 양식' : '설명'}에서 생성했습니다. 게시 전 확인하세요.`,
    category: category.category,
    icon: category.icon,
    fields,
    keywords: deriveKeywords(text, name),
    titlePattern,
    amountField,
    officeCode,
    notes,
  };
}

/* ------------------------------------------------------------------ */

function detectCategory(lower: string): { category: TemplateDraft['category']; icon: string } {
  let best: { category: TemplateDraft['category']; icon: string; hits: number } = {
    category: 'GENERAL',
    icon: 'FileText',
    hits: 0,
  };
  for (const hint of CATEGORY_HINTS) {
    const hits = hint.terms.filter((term) => lower.includes(term)).length;
    if (hits > best.hits) best = { category: hint.category, icon: hint.icon, hits };
  }
  return { category: best.category, icon: best.icon };
}

function detectOffice(lower: string): string | null {
  for (const hint of OFFICE_HINTS) {
    if (hint.terms.some((term) => lower.includes(term))) return hint.code;
  }
  return null;
}

/**
 * Reads a pasted form into fields.
 *
 * Handles the shapes these documents actually take: "문서명: ____",
 * "・日付", "- Amount", "1. 사유". Anything that looks like a label followed by
 * a blank gets a field; prose lines are ignored.
 */
function parseFormLines(text: string): TemplateField[] {
  const all = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (all.length < 2) return [];

  // A first line with no colon, followed by lines that have them, is the
  // document's own title — the thing the form is called, not something to fill
  // in. Pasted forms almost always open this way.
  const headed = !/[:：]/.test(all[0]) && all.slice(1).some((l) => /[:：]/.test(l));
  const lines = headed ? all.slice(1) : all;

  const fields: TemplateField[] = [];
  const used = new Set<string>();

  for (const line of lines) {
    // Strip list markers and numbering.
    const cleaned = line.replace(/^[-*・•‣]\s*/, '').replace(/^\d+[.)]\s*/, '');

    // A label ends at a colon, or the line is short enough to be a label itself.
    const colon = cleaned.match(/^([^:：]{1,40})[:：]\s*(.*)$/);
    const label = colon ? colon[1].trim() : cleaned.length <= 24 ? cleaned.replace(/[_\s]+$/, '').trim() : null;
    if (!label || label.length < 2) continue;

    // Skip headings and sentences.
    if (/[.。!?]$/.test(label) || label.split(/\s+/).length > 6) continue;

    const key = toKey(label, used);
    if (!key) continue;
    used.add(key);

    const trailing = colon ? colon[2] : '';
    fields.push({
      key,
      labelEn: label,
      labelKo: label,
      type: detectType(label, trailing),
      required: fields.length < 3,
      ...(detectType(label, trailing) === 'select' ? { options: optionsFrom(trailing) } : {}),
    });

    if (fields.length >= 20) break;
  }

  return fields;
}

function detectType(label: string, trailing: string): TemplateField['type'] {
  const lower = `${label} ${trailing}`.toLowerCase();
  // A trailing "( A / B / C )" is a choice list.
  if (/[(（].+[/／・].+[)）]/.test(trailing)) return 'select';
  for (const hint of TYPE_HINTS) {
    if (hint.terms.some((term) => lower.includes(term))) return hint.type;
  }
  return 'text';
}

function optionsFrom(trailing: string): { value: string; labelEn: string; labelKo: string }[] {
  const inner = trailing.match(/[(（]([^)）]+)[)）]/)?.[1] ?? '';
  return inner
    .split(/[/／・,、]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 10)
    .map((s, i) => ({ value: `OPT${i + 1}`, labelEn: s, labelKo: s }));
}

/** A default shape per category, for when there is nothing to parse. */
function skeletonFor(category: TemplateDraft['category']): TemplateField[] {
  const subject: TemplateField = {
    key: 'subject',
    labelEn: 'Subject',
    labelKo: '제목',
    type: 'text',
    required: true,
  };
  const reason: TemplateField = {
    key: 'reason',
    labelEn: 'Reason',
    labelKo: '사유',
    type: 'textarea',
    required: true,
  };

  switch (category) {
    case 'HR':
      return [
        subject,
        { key: 'effectiveDate', labelEn: 'Effective date', labelKo: '적용일', type: 'date', required: true },
        reason,
      ];
    case 'FINANCE':
      return [
        subject,
        { key: 'amount', labelEn: 'Amount', labelKo: '금액', type: 'money', required: true },
        { key: 'dueDate', labelEn: 'Due date', labelKo: '기한', type: 'date', required: true },
        reason,
      ];
    case 'TRAVEL':
      return [
        { key: 'destination', labelEn: 'Destination', labelKo: '목적지', type: 'text', required: true },
        { key: 'startDate', labelEn: 'From', labelKo: '시작일', type: 'date', required: true },
        { key: 'endDate', labelEn: 'To', labelKo: '종료일', type: 'date', required: true },
        { key: 'amount', labelEn: 'Estimated cost', labelKo: '예상 비용', type: 'money', required: false },
        reason,
      ];
    case 'DOCUMENT':
      return [
        { key: 'documentName', labelEn: 'Document name', labelKo: '문서명', type: 'text', required: true },
        { key: 'counterparty', labelEn: 'Counterparty', labelKo: '상대처', type: 'text', required: true },
        { key: 'dueDate', labelEn: 'Required by', labelKo: '필요일', type: 'date', required: true },
        reason,
      ];
    default:
      return [subject, reason];
  }
}

function deriveName(text: string, pasted: boolean): { en: string; ko: string } {
  const firstLine = text.split(/\r?\n/)[0].trim();
  // A pasted form usually opens with its own title.
  const raw = pasted ? firstLine : firstLine.replace(/(만들어|생성|추가)\s*(줘|해줘|해)?\.?$/, '').trim();
  const name = raw.replace(/[:：].*$/, '').slice(0, 60).trim() || 'New form';
  return { en: name, ko: name };
}

/**
 * A code that survives a Japanese or Korean form name.
 *
 * Latin words in the name are preferred because they carry meaning; when there
 * are none — which is the normal case for 押印申請書 or 退職金精算書 — office and
 * category still produce something an administrator recognises and can edit,
 * rather than a hash.
 */
function suggestCode(nameEn: string, category: string, officeCode: string | null): string {
  const latin = nameEn
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .join('-')
    .toUpperCase();

  const base = latin || category;
  return [officeCode, base].filter(Boolean).join('-').replace(/[^A-Z0-9-]/g, '').slice(0, 40) || 'FORM';
}

function deriveKeywords(text: string, name: { ko: string }): string[] {
  const words = text
    .toLowerCase()
    .split(/[^a-z0-9가-힣ぁ-んァ-ン一-龯]+/)
    .filter((w) => w.length >= 2 && w.length <= 12);
  const fromName = name.ko.toLowerCase().split(/\s+/).filter((w) => w.length >= 2);
  return [...new Set([...fromName, ...words])].slice(0, 12);
}

/** Latinises a label into an identifier-shaped key, falling back to a position. */
function toKey(label: string, used: Set<string>): string | null {
  const ascii = label
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  let key = ascii.length
    ? ascii[0].toLowerCase() + ascii.slice(1).map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase()).join('')
    : '';

  // Korean or Japanese labels leave nothing ASCII; number them instead.
  if (!/^[a-z]/.test(key)) key = `field${used.size + 1}`;
  key = key.slice(0, 40);

  let unique = key;
  let n = 2;
  while (used.has(unique)) unique = `${key}${n++}`;
  return unique;
}
