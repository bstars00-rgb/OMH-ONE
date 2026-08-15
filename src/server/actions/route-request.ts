'use server';

import { requireSession } from '@/lib/auth/session';
import { assertCan } from '@/lib/rbac';
import { listTemplates } from '@/server/queries/templates';
import { getI18n } from '@/lib/i18n/server';
import { REQUEST_TYPES } from '@/types/domain';

export interface RouteResult {
  ok: boolean;
  href?: string;
  message: string;
}

/**
 * Turns "일본 지사 계약서에 도장 받아야 해" into the Japanese seal application form.
 *
 * Scoring is deterministic and runs over the templates this session may actually
 * file, which matters more than it sounds: the candidate set is already
 * office-filtered, so a Vietnam employee cannot be routed to a Japan-only form
 * however they phrase it. The model is not consulted at all — picking from a
 * known list is a matching problem, and a wrong pick here costs the user a
 * whole form's worth of retyping.
 *
 * Below the confidence floor it declines rather than guessing, and the caller
 * shows the browsable list instead.
 */
export async function routeRequestAction(text: string): Promise<RouteResult> {
  const session = await requireSession();
  assertCan(session, 'request.create');
  const { t, locale } = await getI18n();

  const input = text.trim().toLowerCase();
  if (input.length < 6) return { ok: false, message: t('pick.tooShort') };

  const templates = await listTemplates(session);

  interface Candidate {
    href: string;
    score: number;
    terms: string[];
  }
  const candidates: Candidate[] = [];

  // Built-in types carry their own intent vocabulary in both languages. These
  // outrank templates on a tie because they do real work — a leave request
  // through the typed form gets balance arithmetic that a template cannot give.
  const BUILT_IN: Record<string, string[]> = {
    LEAVE: ['연차', '휴가', '반차', '병가', '쉬', 'leave', 'holiday', 'vacation', 'day off', 'sick'],
    BUSINESS_TRIP: ['출장', '방문', '해외', 'trip', 'travel', 'visit', 'conference', 'onsite'],
    PURCHASE: ['구매', '구입', '지출', '발주', '라이선스', '구독', 'purchase', 'buy', 'procure', 'licence', 'license', 'subscription'],
    EXPENSE: ['경비', '정산', '영수증', '환급', '접대', 'expense', 'claim', 'receipt', 'reimburse'],
    HR: ['증명서', '재직', '인사', '교육', '장비', 'certificate', 'hr', 'training', 'equipment'],
  };

  for (const type of REQUEST_TYPES) {
    const terms = BUILT_IN[type];
    if (!terms) continue;
    const hits = terms.filter((term) => input.includes(term));
    if (hits.length) {
      candidates.push({ href: `/requests/new/${type}`, score: hits.length * 3 + 1, terms: hits });
    }
  }

  for (const tpl of templates) {
    let score = 0;
    const hits: string[] = [];

    // Keywords are the strongest signal: they exist precisely because the form's
    // own name does not contain the word the user typed. "도장" is worth more
    // than "신청서", which appears in half the catalogue.
    for (const kw of tpl.keywords) {
      if (kw.length >= 2 && input.includes(kw.toLowerCase())) {
        score += 5;
        hits.push(kw);
      }
    }

    // Names, descriptions and field labels back that up.
    const haystack = [
      tpl.nameEn,
      tpl.nameKo,
      tpl.descriptionEn ?? '',
      tpl.descriptionKo ?? '',
      ...tpl.fields.flatMap((f) => [f.labelEn, f.labelKo]),
    ]
      .join(' ')
      .toLowerCase();

    const words = [...new Set(haystack.split(/[^a-z0-9가-힣]+/).filter((w) => w.length >= 2))];
    for (const w of words) {
      if (input.includes(w)) {
        score += Math.min(3, w.length / 2);
        hits.push(w);
      }
    }

    if (score > 0) candidates.push({ href: `/requests/new/t/${tpl.id}`, score, terms: hits });
  }

  if (candidates.length === 0) return { ok: false, message: t('pick.noMatch') };

  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];

  // One incidental word is not a decision. A keyword hit alone clears this;
  // two generic word hits do not.
  if (best.score < 5) return { ok: false, message: t('pick.noMatch') };

  // Near-ties mean the wording did not actually distinguish two forms, and
  // guessing costs the user a whole form of retyping. Better to show the list.
  const runnerUp = candidates[1];
  if (runnerUp && best.score - runnerUp.score < 2 && best.href !== runnerUp.href) {
    return { ok: false, message: t('pick.ambiguous') };
  }

  void locale;
  return { ok: true, href: best.href, message: t('pick.matched') };
}
