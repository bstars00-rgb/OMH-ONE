import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Sparkles } from 'lucide-react';
import { getSession } from '@/lib/auth/session';
import { getI18n } from '@/lib/i18n/server';
import { I18nProvider } from '@/lib/i18n/client';
import { BRAND, MODULES } from '@/lib/brand';
import { LoginForm } from './login-form';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t('login.title') };
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (await getSession()) redirect('/');
  const { reason, next } = await searchParams;
  const nextPath = typeof next === 'string' && next.startsWith('/') && !next.startsWith('//') ? next : '/';
  const { t, locale } = await getI18n();

  return (
    <I18nProvider locale={locale}>
      <main className="grid min-h-dvh lg:grid-cols-2">
        {/* Left: the pitch. Hidden on small screens where the form is the whole job. */}
        <section className="relative hidden flex-col justify-between overflow-hidden bg-zinc-950 p-10 text-zinc-100 lg:flex">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-32 -right-24 size-96 rounded-full bg-indigo-600/25 blur-3xl"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-40 -left-20 size-96 rounded-full bg-violet-600/20 blur-3xl"
          />

          <div className="relative flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-lg bg-indigo-500 font-bold">
              {BRAND.mark}
            </span>
            <span className="text-sm font-semibold tracking-tight">{BRAND.name}</span>
          </div>

          <div className="relative max-w-md">
            <h1 className="text-4xl leading-tight font-semibold tracking-tight text-balance">{BRAND.tagline}</h1>
            <p className="mt-4 text-sm leading-relaxed text-zinc-400">{t('login.blurb')}</p>

            {/* The ONE module family — what the platform actually covers. */}
            <ul className="mt-7 flex flex-wrap gap-1.5">
              {Object.values(MODULES).map((m) => (
                <li
                  key={m.name}
                  className={
                    m.planned
                      ? 'rounded-full border border-dashed border-zinc-700 px-2.5 py-1 text-[11px] text-zinc-500'
                      : 'rounded-full border border-zinc-700 bg-zinc-900/60 px-2.5 py-1 text-[11px] text-zinc-300'
                  }
                >
                  {m.name}
                  {m.planned && <span className="ml-1 text-[10px] text-zinc-600">{t('module.planned')}</span>}
                </li>
              ))}
            </ul>

            <ul className="mt-7 space-y-3 text-sm text-zinc-300">
              {[t('login.point1'), t('login.point2'), t('login.point3')].map((line) => (
                <li key={line} className="flex gap-2.5">
                  <Sparkles className="mt-0.5 size-4 shrink-0 text-indigo-400" aria-hidden="true" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>

          <p className="relative text-xs text-zinc-500">{t('login.disclaimer')}</p>
        </section>

        {/* Right: the form */}
        <section className="flex items-center justify-center bg-canvas px-6 py-12">
          <div className="w-full max-w-sm">
            <div className="mb-8 flex items-center gap-2.5 lg:hidden">
              <span className="flex size-8 items-center justify-center rounded-lg bg-accent font-bold text-accent-fg">
                {BRAND.mark}
              </span>
              <span className="text-sm font-semibold tracking-tight text-text">{BRAND.name}</span>
            </div>

            <h2 className="text-xl font-semibold tracking-tight text-text">{t('login.title')}</h2>
            <p className="mt-1 text-sm text-text-muted">{t('login.subtitle')}</p>

            {reason === 'session-expired' && (
              <p
                role="status"
                className="mt-4 rounded-[var(--radius-control)] border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300"
              >
                {t('login.sessionExpired')}
              </p>
            )}

            <LoginForm next={nextPath} />
          </div>
        </section>
      </main>
    </I18nProvider>
  );
}
