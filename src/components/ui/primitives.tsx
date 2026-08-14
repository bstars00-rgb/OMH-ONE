import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn, initials, avatarTint } from '@/lib/utils';

/* ------------------------------------------------------------------ */
/* Button                                                              */
/* ------------------------------------------------------------------ */

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-[var(--radius-control)] font-medium whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-accent text-accent-fg hover:bg-accent-hover',
        secondary: 'bg-surface text-text border border-border-strong hover:bg-surface-hover',
        ghost: 'text-text-muted hover:bg-surface-hover hover:text-text',
        danger: 'bg-rose-600 text-white hover:bg-rose-700',
        success: 'bg-emerald-600 text-white hover:bg-emerald-700',
        warning: 'bg-surface text-orange-700 border border-orange-300 hover:bg-orange-50 dark:text-orange-300 dark:border-orange-800 dark:hover:bg-orange-950/40',
        link: 'text-accent underline-offset-4 hover:underline p-0 h-auto',
      },
      size: {
        sm: 'h-7 px-2.5 text-xs [&_svg]:size-3.5',
        md: 'h-9 px-3.5 text-sm [&_svg]:size-4',
        lg: 'h-10 px-5 text-sm [&_svg]:size-4',
        icon: 'h-9 w-9 [&_svg]:size-4',
        iconSm: 'h-7 w-7 [&_svg]:size-3.5',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, type = 'button', ...props },
  ref,
) {
  return <button ref={ref} type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
});

export { buttonVariants };

/* ------------------------------------------------------------------ */
/* Form fields                                                         */
/* ------------------------------------------------------------------ */

const fieldBase =
  'w-full rounded-[var(--radius-control)] border border-border-strong bg-surface px-3 text-sm text-text placeholder:text-text-subtle transition-colors focus:border-accent disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-rose-500';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cn(fieldBase, 'h-9', className)} {...props} />;
  },
);

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return <textarea ref={ref} className={cn(fieldBase, 'min-h-20 py-2 leading-relaxed', className)} {...props} />;
  },
);

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, ...props }, ref) {
    return (
      <select
        ref={ref}
        className={cn(
          fieldBase,
          'h-9 cursor-pointer appearance-none bg-[length:16px] bg-[right_0.5rem_center] bg-no-repeat pr-8',
          "bg-[url(\"data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke-width='2' stroke='%2371717a'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' d='m19.5 8.25-7.5 7.5-7.5-7.5'/%3E%3C/svg%3E\")]",
          className,
        )}
        {...props}
      />
    );
  },
);

export function Label({ className, required, ...props }: React.LabelHTMLAttributes<HTMLLabelElement> & { required?: boolean }) {
  return (
    <label className={cn('block text-xs font-medium text-text-muted', className)} {...props}>
      {props.children}
      {required && (
        <span className="ml-0.5 text-rose-500" aria-hidden="true">
          *
        </span>
      )}
    </label>
  );
}

/**
 * Label + control + error, wired for screen readers.
 * `error` is announced via role="alert" and linked with aria-describedby.
 */
export function Field({
  label,
  htmlFor,
  error,
  hint,
  required,
  className,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string | null;
  hint?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={htmlFor} required={required}>
        {label}
      </Label>
      {children}
      {hint && !error && (
        <p id={`${htmlFor}-hint`} className="text-xs text-text-subtle">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${htmlFor}-error`} role="alert" className="text-xs font-medium text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}
    </div>
  );
}

export const Checkbox = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Checkbox({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        type="checkbox"
        className={cn(
          'size-4 shrink-0 cursor-pointer rounded-[3px] border border-border-strong bg-surface accent-[var(--accent)]',
          className,
        )}
        {...props}
      />
    );
  },
);

/* ------------------------------------------------------------------ */
/* Card                                                                */
/* ------------------------------------------------------------------ */

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('rounded-[var(--radius-card)] border border-border-subtle bg-surface', className)}
      {...props}
    />
  );
}

export function CardHeader({
  title,
  description,
  actions,
  icon,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-start justify-between gap-4 border-b border-border-subtle px-5 py-3.5', className)}>
      <div className="flex min-w-0 items-start gap-2.5">
        {icon && <span className="mt-0.5 text-text-subtle">{icon}</span>}
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-text">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-text-muted">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function CardBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-5', className)} {...props} />;
}

/* ------------------------------------------------------------------ */
/* Badge                                                               */
/* ------------------------------------------------------------------ */

export const TONE_CLASSES: Record<string, string> = {
  slate: 'bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700',
  blue: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-900',
  amber: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-900',
  emerald:
    'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-900',
  rose: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-900',
  orange:
    'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/50 dark:text-orange-300 dark:border-orange-900',
  indigo:
    'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/50 dark:text-indigo-300 dark:border-indigo-900',
  violet:
    'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/50 dark:text-violet-300 dark:border-violet-900',
};

export function Badge({
  tone = 'slate',
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: keyof typeof TONE_CLASSES | string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap',
        TONE_CLASSES[tone] ?? TONE_CLASSES.slate,
        className,
      )}
      {...props}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Avatar                                                              */
/* ------------------------------------------------------------------ */

export function Avatar({
  name,
  size = 'md',
  className,
}: {
  name: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const sizes = {
    xs: 'size-5 text-[9px]',
    sm: 'size-6 text-[10px]',
    md: 'size-8 text-xs',
    lg: 'size-11 text-sm',
  };
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white select-none',
        avatarTint(name),
        sizes[size],
        className,
      )}
      title={name}
    >
      {initials(name)}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Progress                                                            */
/* ------------------------------------------------------------------ */

export function Progress({
  value,
  max = 100,
  tone,
  className,
  label,
}: {
  value: number;
  max?: number;
  tone?: 'accent' | 'emerald' | 'amber' | 'rose';
  className?: string;
  label?: string;
}) {
  const rawPct = max > 0 ? (value / max) * 100 : 0;
  const pct = Math.min(100, Math.max(0, rawPct));
  const auto = rawPct > 100 ? 'rose' : rawPct > 85 ? 'amber' : 'emerald';
  const resolved = tone ?? auto;
  const bar = {
    accent: 'bg-accent',
    emerald: 'bg-emerald-500',
    amber: 'bg-amber-500',
    rose: 'bg-rose-500',
  }[resolved];

  return (
    <div
      className={cn('h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken', className)}
      role="progressbar"
      aria-valuenow={Math.round(rawPct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div className={cn('h-full rounded-full transition-[width]', bar)} style={{ width: `${pct}%` }} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Skeleton & Alert                                                    */
/* ------------------------------------------------------------------ */

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('animate-pulse rounded bg-surface-sunken', className)} {...props} />;
}

export function Alert({
  tone = 'blue',
  title,
  children,
  icon,
  action,
  className,
}: {
  tone?: keyof typeof TONE_CLASSES;
  title?: React.ReactNode;
  children?: React.ReactNode;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex gap-3 rounded-[var(--radius-card)] border p-3.5', TONE_CLASSES[tone], className)}>
      {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
      <div className="min-w-0 flex-1">
        {title && <p className="text-sm font-semibold">{title}</p>}
        {children && <div className={cn('text-xs leading-relaxed', title && 'mt-1')}>{children}</div>}
      </div>
      {action && <div className="shrink-0 self-center">{action}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Section heading                                                     */
/* ------------------------------------------------------------------ */

export function SectionTitle({
  children,
  action,
  className,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mb-3 flex items-center justify-between gap-4', className)}>
      <h2 className="text-sm font-semibold text-text">{children}</h2>
      {action}
    </div>
  );
}

/** Definition-list row used across all detail panels. */
export function DetailRow({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-baseline justify-between gap-4 py-1.5', className)}>
      <dt className="shrink-0 text-xs text-text-muted">{label}</dt>
      <dd className="min-w-0 text-right text-xs font-medium text-text">{children}</dd>
    </div>
  );
}
