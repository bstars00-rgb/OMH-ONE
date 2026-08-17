import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { and, gte, lte } from 'drizzle-orm';
import { requireSession } from '@/lib/auth/session';
import { can } from '@/lib/rbac';
import { ready } from '@/lib/db/bootstrap';
import { holidays } from '@/lib/db/schema';
import { PageHeader } from '@/components/page-header';
import { ForbiddenPage } from '@/components/ui/states';
import { LeaveForm } from '@/components/requests/new/leave-form';
import { TripForm } from '@/components/requests/new/trip-form';
import { PurchaseForm } from '@/components/requests/new/purchase-form';
import { ExpenseForm } from '@/components/requests/new/expense-form';
import { GenericForm } from '@/components/requests/new/generic-form';
import { listApprovalLines } from '@/server/queries/approval-lines';
import {
  getLeaveFormData,
  getLinkableTrips,
  getPurchaseFormData,
  getTripFormData,
} from '@/server/queries/form-context';
import { getI18n, getT } from '@/lib/i18n/server';
import { REQUEST_TYPES, type RequestType } from '@/types/domain';

export async function generateMetadata({ params }: { params: Promise<{ type: string }> }): Promise<Metadata> {
  const { type } = await params;
  const t = await getT();
  const upper = type.toUpperCase() as RequestType;
  return {
    title: REQUEST_TYPES.includes(upper) ? t('new.pageTitle', { type: t(`type.${upper}`) }) : t('new.breadcrumb'),
  };
}

export default async function NewTypedRequestPage({ params }: { params: Promise<{ type: string }> }) {
  const session = await requireSession();
  const { type: raw } = await params;
  const type = raw.toUpperCase() as RequestType;

  const { t } = await getI18n();

  if (!REQUEST_TYPES.includes(type)) notFound();
  if (!can(session, 'request.create')) return <ForbiddenPage what={t('new.creatingRequests')} />;

  const typeLabel = t(`type.${type}`);

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: t('nav.requests'), href: '/requests' },
          { label: t('new.breadcrumb'), href: '/requests/new' },
          { label: typeLabel },
        ]}
        title={t('new.pageTitle', { type: typeLabel })}
        description={t(`new.desc.${type}`)}
      />
      <FormFor type={type} session={session} />
    </>
  );
}

async function FormFor({ type, session }: { type: RequestType; session: Awaited<ReturnType<typeof requireSession>> }) {
  switch (type) {
    case 'LEAVE': {
      const db = await ready();
      const year = new Date().getUTCFullYear();
      const [data, holidayRows, lines] = await Promise.all([
        getLeaveFormData(session),
        db
          .select({ holidayDate: holidays.holidayDate, name: holidays.name })
          .from(holidays)
          .where(
            and(
              gte(holidays.holidayDate, `${year}-01-01`),
              lte(holidays.holidayDate, `${year + 1}-12-31`),
            ),
          ),
        listApprovalLines(session, { requestType: 'LEAVE' }),
      ]);
      return (
        <LeaveForm
          data={data}
          holidays={holidayRows.map((h) => ({ holidayDate: String(h.holidayDate), name: h.name }))}
          lines={lines}
        />
      );
    }
    case 'BUSINESS_TRIP': {
      const [{ colleagues, destinations }, lines] = await Promise.all([
        getTripFormData(session),
        listApprovalLines(session, { requestType: 'BUSINESS_TRIP' }),
      ]);
      return <TripForm colleagues={colleagues} destinations={destinations} lines={lines} />;
    }
    case 'PURCHASE': {
      const [vendors, lines] = await Promise.all([
        getPurchaseFormData(),
        listApprovalLines(session, { requestType: 'PURCHASE' }),
      ]);
      return <PurchaseForm vendors={vendors} lines={lines} />;
    }
    case 'EXPENSE': {
      const [trips, lines] = await Promise.all([
        getLinkableTrips(session),
        listApprovalLines(session, { requestType: 'EXPENSE' }),
      ]);
      return (
        <ExpenseForm
          lines={lines}
          trips={trips.map((t) => ({
            id: t.id,
            requestNumber: t.requestNumber,
            city: t.city,
            country: t.country,
            startDate: String(t.startDate),
          }))}
        />
      );
    }
    default: {
      const kind = type === 'HR' ? 'HR' : 'GENERAL';
      const lines = await listApprovalLines(session, { requestType: kind });
      return <GenericForm type={kind} lines={lines} />;
    }
  }
}
