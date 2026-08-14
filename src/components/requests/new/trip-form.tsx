'use client';

import * as React from 'react';
import { Plane, Plus, Trash2 } from 'lucide-react';
import { Button, Card, CardBody, CardHeader, Checkbox, Field, Input, Select, Textarea } from '@/components/ui/primitives';
import { AiDraftBox, FieldError, FormActions, useCreateForm } from './form-shell';
import { createTripAction } from '@/server/actions/create';
import { daysBetween, toISODate } from '@/lib/dates';
import { formatMoney, round2 } from '@/lib/money';
import { CURRENCIES, TRIP_COST_CATEGORIES } from '@/types/domain';
import { humanize } from '@/lib/utils';

interface CostLine {
  key: string;
  category: string;
  description: string;
  amount: string;
}

const newLine = (category = 'FLIGHT'): CostLine => ({
  key: Math.random().toString(36).slice(2),
  category,
  description: '',
  amount: '',
});

export function TripForm({
  colleagues,
  destinations,
}: {
  colleagues: { id: string; name: string; departmentCode: string | null }[];
  destinations: { city: string; country: string; avgHotel: number }[];
}) {
  const today = toISODate(new Date());
  const [country, setCountry] = React.useState('');
  const [city, setCity] = React.useState('');
  const [isInternational, setIsInternational] = React.useState(true);
  const [purpose, setPurpose] = React.useState('');
  const [eventName, setEventName] = React.useState('');
  const [partner, setPartner] = React.useState('');
  const [startDate, setStartDate] = React.useState('');
  const [endDate, setEndDate] = React.useState('');
  const [outboundFlight, setOutbound] = React.useState('');
  const [inboundFlight, setInbound] = React.useState('');
  const [hotelName, setHotelName] = React.useState('');
  const [hotelNights, setHotelNights] = React.useState('');
  const [hotelRatePerNight, setHotelRate] = React.useState('');
  const [transportation, setTransportation] = React.useState('');
  const [currency, setCurrency] = React.useState('USD');
  const [travelerIds, setTravelerIds] = React.useState<string[]>([]);
  const [costs, setCosts] = React.useState<CostLine[]>([newLine('FLIGHT'), newLine('HOTEL')]);

  const { pending, result, errors, run } = useCreateForm();

  const nights = Number(hotelNights) || 0;
  const rate = Number(hotelRatePerNight) || 0;
  const total = round2(costs.reduce((s, c) => s + (Number(c.amount) || 0), 0));
  const travellerCount = travelerIds.length + 1;
  const duration = startDate && endDate && endDate >= startDate ? daysBetween(startDate, endDate) + 1 : 0;
  const knownDest = destinations.find((d) => d.city.toLowerCase() === city.trim().toLowerCase());

  // Keep the hotel cost line in step with nights × rate × rooms, unless the user
  // has typed their own number in it.
  const hotelTouched = React.useRef(false);
  React.useEffect(() => {
    if (hotelTouched.current || !nights || !rate) return;
    const computed = round2(nights * rate * travellerCount);
    setCosts((prev) =>
      prev.map((c) =>
        c.category === 'HOTEL' && !c.amount
          ? { ...c, amount: String(computed), description: `${nights} night(s) × ${travellerCount} room(s)` }
          : c,
      ),
    );
  }, [nights, rate, travellerCount]);

  function payload() {
    return {
      country,
      city,
      isInternational,
      purpose,
      eventName,
      partner,
      startDate,
      endDate,
      outboundFlight,
      inboundFlight,
      hotelName,
      hotelNights: nights,
      hotelRatePerNight: rate,
      transportation,
      currency,
      travelerIds,
      costs: costs
        .filter((c) => Number(c.amount) > 0)
        .map((c) => ({ category: c.category, description: c.description, amount: Number(c.amount) })),
    };
  }

  function applyDraft(fields: Record<string, unknown>) {
    if (typeof fields.city === 'string') setCity(fields.city);
    if (typeof fields.country === 'string') {
      setCountry(fields.country);
      setIsInternational(fields.country !== 'Vietnam');
    }
    if (typeof fields.startDate === 'string') setStartDate(fields.startDate);
    if (typeof fields.endDate === 'string') {
      setEndDate(fields.endDate);
      if (typeof fields.startDate === 'string') {
        setHotelNights(String(Math.max(0, daysBetween(fields.startDate, fields.endDate))));
      }
    }
    if (typeof fields.purpose === 'string') setPurpose(fields.purpose);
    if (typeof fields.eventName === 'string') setEventName(fields.eventName);
    if (typeof fields.outboundFlight === 'string') setOutbound(fields.outboundFlight);
    if (typeof fields.inboundFlight === 'string') setInbound(fields.inboundFlight);
    if (Array.isArray(fields.travelerIds)) setTravelerIds(fields.travelerIds as string[]);
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="space-y-4">
        <AiDraftBox type="BUSINESS_TRIP" onDraft={applyDraft} />

        <Card>
          <CardHeader title="Destination and dates" icon={<Plane className="size-4" />} />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <Field label="City" htmlFor="city" required error={errors.city}>
              <Input id="city" list="known-cities" value={city} onChange={(e) => setCity(e.target.value)} />
              <datalist id="known-cities">
                {destinations.map((d) => (
                  <option key={`${d.city}-${d.country}`} value={d.city} />
                ))}
              </datalist>
            </Field>

            <Field label="Country" htmlFor="country" required error={errors.country}>
              <Input
                id="country"
                list="known-countries"
                value={country}
                onChange={(e) => {
                  setCountry(e.target.value);
                  setIsInternational(e.target.value.trim().toLowerCase() !== 'vietnam');
                }}
              />
              <datalist id="known-countries">
                {[...new Set(destinations.map((d) => d.country))].map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </Field>

            <Field label="Departure" htmlFor="startDate" required error={errors.startDate}>
              <Input id="startDate" type="date" min={today} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </Field>

            <Field label="Return" htmlFor="endDate" required error={errors.endDate}>
              <Input
                id="endDate"
                type="date"
                min={startDate || today}
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  if (startDate && !hotelNights) setHotelNights(String(Math.max(0, daysBetween(startDate, e.target.value))));
                }}
              />
            </Field>

            <label className="flex items-center gap-2 text-xs text-text sm:col-span-2">
              <Checkbox checked={isInternational} onChange={(e) => setIsInternational(e.target.checked)} />
              International trip
              <span className="text-text-subtle">— international travel always requires Director approval.</span>
            </label>

            <Field label="Purpose" htmlFor="purpose" required className="sm:col-span-2" error={errors.purpose}>
              <Textarea
                id="purpose"
                rows={3}
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                placeholder="What is the trip for, and why does it need to happen in person?"
              />
            </Field>

            <Field label="Event or conference" htmlFor="eventName" error={errors.eventName}>
              <Input id="eventName" value={eventName} onChange={(e) => setEventName(e.target.value)} />
            </Field>

            <Field label="Partner or counterparty" htmlFor="partner" error={errors.partner}>
              <Input id="partner" value={partner} onChange={(e) => setPartner(e.target.value)} />
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Travellers" description="You are included automatically." />
          <CardBody>
            <fieldset>
              <legend className="sr-only">Additional travellers</legend>
              <div className="grid max-h-52 gap-1 overflow-y-auto sm:grid-cols-2">
                {colleagues.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 rounded px-1.5 py-1 text-xs hover:bg-surface-hover">
                    <Checkbox
                      checked={travelerIds.includes(c.id)}
                      onChange={(e) =>
                        setTravelerIds((prev) => (e.target.checked ? [...prev, c.id] : prev.filter((x) => x !== c.id)))
                      }
                    />
                    <span className="truncate text-text">{c.name}</span>
                    <span className="ml-auto shrink-0 text-[10px] text-text-subtle">{c.departmentCode}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Flights, hotel and transport" />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <Field label="Outbound flight" htmlFor="outboundFlight" error={errors.outboundFlight}>
              <Input id="outboundFlight" value={outboundFlight} onChange={(e) => setOutbound(e.target.value)} placeholder="VN425" />
            </Field>
            <Field label="Return flight" htmlFor="inboundFlight" error={errors.inboundFlight}>
              <Input id="inboundFlight" value={inboundFlight} onChange={(e) => setInbound(e.target.value)} placeholder="VN669" />
            </Field>
            <Field label="Hotel" htmlFor="hotelName" error={errors.hotelName}>
              <Input id="hotelName" value={hotelName} onChange={(e) => setHotelName(e.target.value)} />
            </Field>
            <Field label="Transport" htmlFor="transportation" error={errors.transportation}>
              <Input id="transportation" value={transportation} onChange={(e) => setTransportation(e.target.value)} />
            </Field>
            <Field label="Nights" htmlFor="hotelNights" error={errors.hotelNights}>
              <Input id="hotelNights" type="number" min={0} value={hotelNights} onChange={(e) => setHotelNights(e.target.value)} />
            </Field>
            <Field
              label="Rate per night"
              htmlFor="hotelRatePerNight"
              hint={
                knownDest && knownDest.avgHotel > 0
                  ? `Company average in ${knownDest.city}: ${formatMoney(knownDest.avgHotel)}. Policy cap is $150.`
                  : 'Policy cap is $150 per night.'
              }
              error={errors.hotelRatePerNight}
            >
              <Input
                id="hotelRatePerNight"
                type="number"
                min={0}
                step="0.01"
                value={hotelRatePerNight}
                onChange={(e) => {
                  hotelTouched.current = false;
                  setHotelRate(e.target.value);
                }}
              />
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Estimated cost"
            description="Break the estimate down so approvers can see where the money goes."
            actions={
              <Button size="sm" variant="secondary" onClick={() => setCosts((p) => [...p, newLine('OTHER')])}>
                <Plus /> Add line
              </Button>
            }
          />
          <CardBody className="space-y-2">
            {costs.map((line, i) => (
              <div key={line.key} className="grid gap-2 sm:grid-cols-[9rem_minmax(0,1fr)_8rem_auto]">
                <Select
                  aria-label={`Cost category ${i + 1}`}
                  value={line.category}
                  onChange={(e) => setCosts((p) => p.map((c) => (c.key === line.key ? { ...c, category: e.target.value } : c)))}
                >
                  {TRIP_COST_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {humanize(c)}
                    </option>
                  ))}
                </Select>
                <Input
                  aria-label={`Cost description ${i + 1}`}
                  placeholder="Description"
                  value={line.description}
                  onChange={(e) => setCosts((p) => p.map((c) => (c.key === line.key ? { ...c, description: e.target.value } : c)))}
                />
                <Input
                  aria-label={`Cost amount ${i + 1}`}
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="0.00"
                  value={line.amount}
                  onChange={(e) => {
                    if (line.category === 'HOTEL') hotelTouched.current = true;
                    setCosts((p) => p.map((c) => (c.key === line.key ? { ...c, amount: e.target.value } : c)));
                  }}
                />
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Remove cost line ${i + 1}`}
                  disabled={costs.length === 1}
                  onClick={() => setCosts((p) => p.filter((c) => c.key !== line.key))}
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
            <FieldError id="costs-error" message={errors.costs} />

            <div className="flex items-center justify-between border-t border-border-subtle pt-2.5">
              <Select
                aria-label="Currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="h-8 w-24"
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
              <p className="text-sm font-semibold text-text tabular">
                Total {formatMoney(total, currency)}
                {travellerCount > 1 && (
                  <span className="ml-2 text-xs font-normal text-text-muted">
                    {formatMoney(round2(total / travellerCount), currency)} per traveller
                  </span>
                )}
              </p>
            </div>
          </CardBody>
        </Card>

        <FieldError id="form-error" message={errors._form} />

        <FormActions
          onSave={() => run((s) => createTripAction(payload(), s), false)}
          onSubmit={() => run((s) => createTripAction(payload(), s), true)}
          pending={pending}
          result={result}
          disabled={!city || !country || !startDate || !endDate}
        />
      </div>

      <aside>
        <Card className="sticky top-20">
          <CardHeader title="Summary" />
          <CardBody className="space-y-1.5 text-xs">
            <SummaryRow label="Destination" value={city && country ? `${city}, ${country}` : '—'} />
            <SummaryRow label="Duration" value={duration ? `${duration} day${duration === 1 ? '' : 's'}` : '—'} />
            <SummaryRow label="Travellers" value={String(travellerCount)} />
            <SummaryRow label="Hotel" value={nights && rate ? `${nights} × ${formatMoney(rate, currency)}` : '—'} />
            <SummaryRow label="Total" value={formatMoney(total, currency)} strong />
            {rate > 150 && (
              <p className="mt-2 rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300">
                {formatMoney(rate, currency)} per night is above the $150 policy cap. You can still submit — the approver
                will see the difference and the reason.
              </p>
            )}
            {isInternational && (
              <p className="mt-2 text-[11px] text-text-subtle">International — routes to the Director after your manager.</p>
            )}
          </CardBody>
        </Card>
      </aside>
    </div>
  );
}

function SummaryRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-text-muted">{label}</span>
      <span className={strong ? 'font-semibold text-text tabular' : 'text-text tabular'}>{value}</span>
    </div>
  );
}
