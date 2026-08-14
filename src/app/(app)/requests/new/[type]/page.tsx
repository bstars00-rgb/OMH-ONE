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
import {
  getLeaveFormData,
  getLinkableTrips,
  getPurchaseFormData,
  getTripFormData,
} from '@/server/queries/form-context';
import { REQUEST_TYPES, REQUEST_TYPE_META, type RequestType } from '@/types/domain';

export async function generateMetadata({ params }: { params: Promise<{ type: string }> }): Promise<Metadata> {
  const { type } = await params;
  const meta = REQUEST_TYPE_META[type as RequestType];
  return { title: meta ? `New ${meta.label}` : 'New request' };
}

const DESCRIPTIONS: Record<RequestType, string> = {
  LEAVE: 'Working days, public holidays and your remaining balance are calculated as you type.',
  BUSINESS_TRIP: 'Enter the trip once. Routing, policy checks and the comparison against previous trips happen automatically.',
  PURCHASE: 'Approvers see this priced against previous purchases of the same item and your department budget.',
  EXPENSE: 'Attach receipts and the lines fill themselves in. Every line is checked against other claims for duplicates.',
  HR: 'Goes to your line manager, then HR.',
  GENERAL: 'For anything that needs a decision but does not fit the other types.',
};

export default async function NewTypedRequestPage({ params }: { params: Promise<{ type: string }> }) {
  const session = await requireSession();
  const { type: raw } = await params;
  const type = raw.toUpperCase() as RequestType;

  if (!REQUEST_TYPES.includes(type)) notFound();
  if (!can(session, 'request.create')) return <ForbiddenPage what="creating requests" />;

  const meta = REQUEST_TYPE_META[type];

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: 'My Requests', href: '/requests' },
          { label: 'New request', href: '/requests/new' },
          { label: meta.label },
        ]}
        title={`New ${meta.label.toLowerCase()}`}
        description={DESCRIPTIONS[type]}
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
      const [data, holidayRows] = await Promise.all([
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
      ]);
      return (
        <LeaveForm
          data={data}
          holidays={holidayRows.map((h) => ({ holidayDate: String(h.holidayDate), name: h.name }))}
        />
      );
    }
    case 'BUSINESS_TRIP': {
      const { colleagues, destinations } = await getTripFormData(session);
      return <TripForm colleagues={colleagues} destinations={destinations} />;
    }
    case 'PURCHASE': {
      const vendors = await getPurchaseFormData();
      return <PurchaseForm vendors={vendors} />;
    }
    case 'EXPENSE': {
      const trips = await getLinkableTrips(session);
      return (
        <ExpenseForm
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
    default:
      return <GenericForm type={type === 'HR' ? 'HR' : 'GENERAL'} />;
  }
}
