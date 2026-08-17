'use client';

import * as React from 'react';
import { Plane, Plus, Trash2 } from 'lucide-react';
import { Button, Card, CardBody, CardHeader, Checkbox, Field, Input, Select, Textarea } from '@/components/ui/primitives';
import { AiDraftBox, FieldError, FormActions, useCreateForm } from './form-shell';
import { ChainPicker, type LineOption } from './chain-picker';
import { createTripAction } from '@/server/actions/create';
import { daysBetween, toISODate } from '@/lib/dates';
import { round2 } from '@/lib/money';
import { useI18n } from '@/lib/i18n/client';
import { formatMoneyL } from '@/lib/i18n/format';
import { CURRENCIES, TRIP_COST_CATEGORIES } from '@/types/domain';

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
  lines,
  destinations,
}: {
  colleagues: { id: string; name: string; departmentCode: string | null }[];
  lines: LineOption[];
  destinations: { city: string; country: string; avgHotel: number }[];
}) {
  const { t, locale } = useI18n();
  const money = (v: number) => formatMoneyL(locale, v, currency);
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
  const [approverIds, setApproverIds] = React.useState<string[]>([]);
  const [lineId, setLineId] = React.useState<string | null>(null);

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
          ? { ...c, amount: String(computed), description: t('tripForm.hotelLine', { nights, rooms: travellerCount }) }
          : c,
      ),
    );
  }, [nights, rate, travellerCount, t]);

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
          <CardHeader title={t('tripForm.destinationDates')} icon={<Plane className="size-4" />} />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <Field label={t('tripForm.city')} htmlFor="city" required error={errors.city}>
              <Input id="city" list="known-cities" value={city} onChange={(e) => setCity(e.target.value)} />
              <datalist id="known-cities">
                {destinations.map((d) => (
                  <option key={`${d.city}-${d.country}`} value={d.city} />
                ))}
              </datalist>
            </Field>

            <Field label={t('tripForm.country')} htmlFor="country" required error={errors.country}>
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

            <Field label={t('tripForm.departure')} htmlFor="startDate" required error={errors.startDate}>
              <Input id="startDate" type="date" min={today} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </Field>

            <Field label={t('tripForm.return')} htmlFor="endDate" required error={errors.endDate}>
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
              {t('tripForm.internationalLabel')}
              <span className="text-text-subtle">{t('tripForm.internationalHint')}</span>
            </label>

            <Field label={t('label.purpose')} htmlFor="purpose" required className="sm:col-span-2" error={errors.purpose}>
              <Textarea
                id="purpose"
                rows={3}
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                placeholder={t('tripForm.purposePlaceholder')}
              />
            </Field>

            <Field label={t('tripForm.eventLabel')} htmlFor="eventName" error={errors.eventName}>
              <Input id="eventName" value={eventName} onChange={(e) => setEventName(e.target.value)} />
            </Field>

            <Field label={t('tripForm.partnerLabel')} htmlFor="partner" error={errors.partner}>
              <Input id="partner" value={partner} onChange={(e) => setPartner(e.target.value)} />
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t('tripForm.travellersTitle')} description={t('tripForm.travellersSub')} />
          <CardBody>
            <fieldset>
              <legend className="sr-only">{t('tripForm.additionalTravellers')}</legend>
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
          <CardHeader title={t('tripForm.logistics')} />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <Field label={t('content.outbound')} htmlFor="outboundFlight" error={errors.outboundFlight}>
              <Input id="outboundFlight" value={outboundFlight} onChange={(e) => setOutbound(e.target.value)} placeholder="VN425" />
            </Field>
            <Field label={t('content.inbound')} htmlFor="inboundFlight" error={errors.inboundFlight}>
              <Input id="inboundFlight" value={inboundFlight} onChange={(e) => setInbound(e.target.value)} placeholder="VN669" />
            </Field>
            <Field label={t('content.hotel')} htmlFor="hotelName" error={errors.hotelName}>
              <Input id="hotelName" value={hotelName} onChange={(e) => setHotelName(e.target.value)} />
            </Field>
            <Field label={t('content.transport')} htmlFor="transportation" error={errors.transportation}>
              <Input id="transportation" value={transportation} onChange={(e) => setTransportation(e.target.value)} />
            </Field>
            <Field label={t('content.nights')} htmlFor="hotelNights" error={errors.hotelNights}>
              <Input id="hotelNights" type="number" min={0} value={hotelNights} onChange={(e) => setHotelNights(e.target.value)} />
            </Field>
            <Field
              label={t('content.ratePerNight')}
              htmlFor="hotelRatePerNight"
              hint={
                knownDest && knownDest.avgHotel > 0
                  ? t('tripForm.rateHintKnown', {
                      city: knownDest.city,
                      amount: formatMoneyL(locale, knownDest.avgHotel),
                    })
                  : t('tripForm.rateHint')
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
            title={t('tripForm.estimatedCost')}
            description={t('tripForm.estimatedCostSub')}
            actions={
              <Button size="sm" variant="secondary" onClick={() => setCosts((p) => [...p, newLine('OTHER')])}>
                <Plus /> {t('tripForm.addLine')}
              </Button>
            }
          />
          <CardBody className="space-y-2">
            {costs.map((line, i) => (
              <div key={line.key} className="grid gap-2 sm:grid-cols-[9rem_minmax(0,1fr)_8rem_auto]">
                <Select
                  aria-label={t('tripForm.costCategory', { n: i + 1 })}
                  value={line.category}
                  onChange={(e) => setCosts((p) => p.map((c) => (c.key === line.key ? { ...c, category: e.target.value } : c)))}
                >
                  {TRIP_COST_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {t(`tripCost.${c}`)}
                    </option>
                  ))}
                </Select>
                <Input
                  aria-label={t('tripForm.costDescription', { n: i + 1 })}
                  placeholder={t('label.description')}
                  value={line.description}
                  onChange={(e) => setCosts((p) => p.map((c) => (c.key === line.key ? { ...c, description: e.target.value } : c)))}
                />
                <Input
                  aria-label={t('tripForm.costAmount', { n: i + 1 })}
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
                  aria-label={t('tripForm.removeCost', { n: i + 1 })}
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
                aria-label={t('label.currency')}
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
                {t('tripForm.totalLine', { amount: money(total) })}
                {travellerCount > 1 && (
                  <span className="ml-2 text-xs font-normal text-text-muted">
                    {t('content.perTraveller', { amount: money(round2(total / travellerCount)) })}
                  </span>
                )}
              </p>
            </div>
          </CardBody>
        </Card>

        <FieldError id="form-error" message={errors._form} />

        <FormActions
          onSave={() => run((s) => createTripAction(payload(), s, { approverIds, approvalLineId: lineId }), false)}
          onSubmit={() => run((s) => createTripAction(payload(), s, { approverIds, approvalLineId: lineId }), true)}
          pending={pending}
          result={result}
          disabled={!city || !country || !startDate || !endDate}
        />
      </div>

      <aside className="space-y-4">
        <ChainPicker
          facts={{ requestType: 'BUSINESS_TRIP', amountBase: total, isInternational }}
          colleagues={colleagues}
          lines={lines}
          value={approverIds}
          onChange={setApproverIds}
          onLineChange={setLineId}
        />
        <Card className="sticky top-20">
          <CardHeader title={t('tripForm.summary')} />
          <CardBody className="space-y-1.5 text-xs">
            <SummaryRow label={t('content.destination')} value={city && country ? `${city}, ${country}` : '—'} />
            <SummaryRow label={t('content.duration')} value={duration ? t('unit.days', { count: duration }) : '—'} />
            <SummaryRow label={t('tripForm.travellersTitle')} value={String(travellerCount)} />
            <SummaryRow label={t('content.hotel')} value={nights && rate ? `${nights} × ${money(rate)}` : '—'} />
            <SummaryRow label={t('label.total')} value={money(total)} strong />
            {rate > 150 && (
              <p className="mt-2 rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300">
                {t('tripForm.hotelOver', { rate: money(rate) })}
              </p>
            )}
            {isInternational && <p className="mt-2 text-[11px] text-text-subtle">{t('tripForm.internationalNote')}</p>}
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
