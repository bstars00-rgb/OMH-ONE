'use client';

import * as React from 'react';
import { useActionState } from 'react';
import { AlertCircle, Loader2, LogIn } from 'lucide-react';
import { loginAction, type LoginState } from '@/server/actions/auth';
import { Button, Field, Input } from '@/components/ui/primitives';
import { useI18n } from '@/lib/i18n/client';
import { LOCALES, LOCALE_META } from '@/lib/i18n/types';
import { setLocaleAction } from '@/server/actions/office';
import { cn } from '@/lib/utils';

const DEMO_ACCOUNTS = [
  { email: 'jackie@ohmyhotel.com', name: 'Jackie Lee', roleKey: 'role.DIRECTOR' },
  { email: 'admin@ohmyhotel.com', name: 'Ethan Park', roleKey: 'role.ADMIN' },
  { email: 'mia@ohmyhotel.com', name: 'Mia Song', roleKey: 'role.HR' },
  { email: 'finance@ohmyhotel.com', name: 'Olivia Chen', roleKey: 'role.FINANCE' },
  { email: 'vicky@ohmyhotel.com', name: 'Vicky Nguyen', roleKey: 'role.MANAGER' },
  { email: 'employee@ohmyhotel.com', name: 'Bryant Vo', roleKey: 'role.EMPLOYEE' },
  { email: 'auditor@ohmyhotel.com', name: 'Sena Ko', roleKey: 'role.AUDITOR' },
];

const DEMO_PASSWORD = 'demo1234';

export function LoginForm({ next }: { next?: string }) {
  const { t, locale } = useI18n();
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, {});
  const [email, setEmail] = React.useState('jackie@ohmyhotel.com');
  const [password, setPassword] = React.useState(DEMO_PASSWORD);

  return (
    <>
      {/* Language is selectable before signing in — the locale cookie is not tied to a session. */}
      <div className="mt-4 flex gap-1">
        {LOCALES.map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => setLocaleAction(l).then(() => window.location.reload())}
            className={cn(
              'rounded-[var(--radius-control)] border px-2.5 py-1 text-[11px] font-medium transition-colors',
              locale === l
                ? 'border-accent bg-accent-soft text-accent'
                : 'border-border-subtle text-text-muted hover:bg-surface-hover',
            )}
          >
            {LOCALE_META[l].nativeLabel}
          </button>
        ))}
      </div>

      <form action={action} className="mt-5 space-y-4">
        <input type="hidden" name="next" value={next ?? '/'} />

        <Field label={t('label.email')} htmlFor="email" required>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={Boolean(state.error)}
            aria-describedby={state.error ? 'login-error' : undefined}
          />
        </Field>

        <Field label={t('label.password')} htmlFor="password" required>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={Boolean(state.error)}
            aria-describedby={state.error ? 'login-error' : undefined}
          />
        </Field>

        {state.error && (
          <p
            id="login-error"
            role="alert"
            className="flex items-center gap-2 rounded-[var(--radius-control)] border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300"
          >
            <AlertCircle className="size-4 shrink-0" />
            {t(state.error)}
          </p>
        )}

        <Button type="submit" variant="primary" size="lg" className="w-full" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <LogIn />}
          {pending ? t('state.signingIn') : t('action.signIn')}
        </Button>
      </form>

      <div className="mt-8">
        <p className="text-xs font-medium text-text-muted">{t('login.demoAccounts', { password: DEMO_PASSWORD })}</p>
        <div className="mt-2 grid gap-1.5">
          {DEMO_ACCOUNTS.map((a) => (
            <button
              key={a.email}
              type="button"
              onClick={() => {
                setEmail(a.email);
                setPassword(DEMO_PASSWORD);
              }}
              className="flex items-center justify-between rounded-[var(--radius-control)] border border-border-subtle bg-surface px-3 py-2 text-left transition-colors hover:border-accent-border hover:bg-accent-soft"
            >
              <span className="min-w-0">
                <span className="block truncate text-xs font-medium text-text">{a.name}</span>
                <span className="block truncate text-[11px] text-text-subtle">{a.email}</span>
              </span>
              <span className="ml-3 shrink-0 rounded bg-surface-sunken px-1.5 py-0.5 text-[10px] font-medium text-text-muted">
                {t(a.roleKey)}
              </span>
            </button>
          ))}
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-text-subtle">{t('login.demoHint')}</p>
      </div>
    </>
  );
}
