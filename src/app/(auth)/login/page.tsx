import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Sparkles } from 'lucide-react';
import { getSession } from '@/lib/auth/session';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Sign in' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (await getSession()) redirect('/');
  const { reason, next } = await searchParams;
  const nextPath = typeof next === 'string' && next.startsWith('/') && !next.startsWith('//') ? next : '/';

  return (
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
          <span className="flex size-8 items-center justify-center rounded-lg bg-indigo-500 font-bold">O</span>
          <span className="text-sm font-semibold tracking-tight">OHMY AI ERP</span>
        </div>

        <div className="relative max-w-md">
          <h1 className="text-3xl leading-tight font-semibold tracking-tight text-balance">
            One place to request, approve, analyze and operate.
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-zinc-400">
            Approvals, leave, travel, procurement and expense in a single system — with AI that summarizes the
            request, checks it against company policy, and tells the approver what actually needs their attention.
          </p>
          <ul className="mt-8 space-y-3 text-sm text-zinc-300">
            {[
              'Every request routed automatically by amount, duration and destination',
              'Policy and budget checked before a human reads it',
              'Ask questions of company data in plain language',
            ].map((line) => (
              <li key={line} className="flex gap-2.5">
                <Sparkles className="mt-0.5 size-4 shrink-0 text-indigo-400" aria-hidden="true" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-zinc-500">
          Prototype environment. All employees, vendors and figures shown are fictional demo data.
        </p>
      </section>

      {/* Right: the form */}
      <section className="flex items-center justify-center bg-canvas px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <span className="flex size-8 items-center justify-center rounded-lg bg-accent font-bold text-accent-fg">
              O
            </span>
            <span className="text-sm font-semibold tracking-tight text-text">OHMY AI ERP</span>
          </div>

          <h2 className="text-xl font-semibold tracking-tight text-text">Sign in</h2>
          <p className="mt-1 text-sm text-text-muted">Use a demo account below, or your own credentials.</p>

          {reason === 'session-expired' && (
            <p
              role="status"
              className="mt-4 rounded-[var(--radius-control)] border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300"
            >
              Your session is no longer valid. Please sign in again.
            </p>
          )}

          <LoginForm next={nextPath} />
        </div>
      </section>
    </main>
  );
}
