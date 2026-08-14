'use client';

import * as React from 'react';
import { useActionState } from 'react';
import { AlertCircle, Loader2, LogIn } from 'lucide-react';
import { loginAction, type LoginState } from '@/server/actions/auth';
import { Button, Field, Input } from '@/components/ui/primitives';

const DEMO_ACCOUNTS = [
  { email: 'aiden@ohmyhotel.com', label: 'Aiden Park', role: 'Director' },
  { email: 'admin@ohmyhotel.com', label: 'Ethan Park', role: 'Admin' },
  { email: 'mia@ohmyhotel.com', label: 'Mia Song', role: 'HR' },
  { email: 'finance@ohmyhotel.com', label: 'Olivia Chen', role: 'Finance' },
  { email: 'vicky@ohmyhotel.com', label: 'Vicky Nguyen', role: 'Manager' },
  { email: 'employee@ohmyhotel.com', label: 'Bryant Vo', role: 'Employee' },
  { email: 'auditor@ohmyhotel.com', label: 'Sena Ko', role: 'Auditor' },
];

const DEMO_PASSWORD = 'demo1234';

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, {});
  const [email, setEmail] = React.useState('aiden@ohmyhotel.com');
  const [password, setPassword] = React.useState(DEMO_PASSWORD);

  return (
    <>
      <form action={action} className="mt-6 space-y-4">
        <input type="hidden" name="next" value={next ?? '/'} />
        <Field label="Email" htmlFor="email" required>
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

        <Field label="Password" htmlFor="password" required>
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
            {state.error}
          </p>
        )}

        <Button type="submit" variant="primary" size="lg" className="w-full" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <LogIn />}
          {pending ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>

      <div className="mt-8">
        <p className="text-xs font-medium text-text-muted">Demo accounts — password {DEMO_PASSWORD}</p>
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
                <span className="block truncate text-xs font-medium text-text">{a.label}</span>
                <span className="block truncate text-[11px] text-text-subtle">{a.email}</span>
              </span>
              <span className="ml-3 shrink-0 rounded bg-surface-sunken px-1.5 py-0.5 text-[10px] font-medium text-text-muted">
                {a.role}
              </span>
            </button>
          ))}
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-text-subtle">
          Selecting an account fills the form — it does not sign you in. These are prototype credentials and are not
          valid anywhere else.
        </p>
      </div>
    </>
  );
}
