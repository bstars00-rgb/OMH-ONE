import type { RequestFilters } from '@/server/queries/requests';
import { PRIORITIES, REQUEST_STATUSES, REQUEST_TYPES, RISK_LEVELS } from '@/types/domain';

export type RawSearchParams = Record<string, string | string[] | undefined>;

function one(v: string | string[] | undefined): string | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  return s?.trim() ? s.trim() : undefined;
}

/** Comma-separated list, filtered against the allowed values. Unknown values are dropped. */
function list(v: string | string[] | undefined, allowed: readonly string[]): string[] | undefined {
  const raw = one(v);
  if (!raw) return undefined;
  const parts = raw.split(',').map((p) => p.trim().toUpperCase()).filter((p) => allowed.includes(p));
  return parts.length ? parts : undefined;
}

function positiveNumber(v: string | string[] | undefined): number | undefined {
  const raw = one(v);
  if (raw === undefined) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

function isoDate(v: string | string[] | undefined): string | undefined {
  const raw = one(v);
  return raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : undefined;
}

const SORTS = ['priority', 'newest', 'oldest', 'amount', 'sla'] as const;

/**
 * Parses URL parameters into typed filters, dropping anything unrecognized.
 *
 * Nothing from the query string reaches SQL unvalidated — enum-like values are
 * checked against their allowed set and numbers/dates are shape-checked, so a
 * hand-edited URL cannot widen the query beyond what the UI can express.
 */
export function parseRequestFilters(sp: RawSearchParams, defaults: Partial<RequestFilters> = {}): RequestFilters {
  const sortRaw = one(sp.sort);
  const page = Number(one(sp.page) ?? 1);

  return {
    ...defaults,
    type: list(sp.type, REQUEST_TYPES) ?? defaults.type,
    status: list(sp.status, REQUEST_STATUSES) ?? defaults.status,
    priority: list(sp.priority, PRIORITIES) ?? defaults.priority,
    risk: list(sp.risk, RISK_LEVELS) ?? defaults.risk,
    departmentId: one(sp.departmentId),
    requesterId: one(sp.requesterId),
    from: isoDate(sp.from),
    to: isoDate(sp.to),
    minAmount: positiveNumber(sp.minAmount),
    maxAmount: positiveNumber(sp.maxAmount),
    q: one(sp.q),
    sort: (SORTS as readonly string[]).includes(sortRaw ?? '') ? (sortRaw as RequestFilters['sort']) : defaults.sort,
    page: Number.isFinite(page) && page > 0 ? Math.floor(page) : 1,
    pageSize: defaults.pageSize ?? 25,
  };
}

/** Rebuilds a URLSearchParams from the raw record, for sort/pagination links. */
export function toURLSearchParams(sp: RawSearchParams): URLSearchParams {
  const out = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    const val = one(v);
    if (val) out.set(k, val);
  }
  return out;
}
