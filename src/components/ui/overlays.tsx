'use client';

import * as React from 'react';
import { useT } from '@/lib/i18n/client';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import * as DropdownPrimitive from '@radix-ui/react-dropdown-menu';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

/* ------------------------------------------------------------------ */
/* Dialog                                                              */
/* ------------------------------------------------------------------ */

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({
  title,
  description,
  children,
  className,
  footer,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  footer?: React.ReactNode;
}) {
  const t = useT();
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-zinc-950/50 backdrop-blur-[1px] data-[state=open]:animate-in data-[state=open]:fade-in" />
      <DialogPrimitive.Content
        className={cn(
          'fixed top-1/2 left-1/2 z-50 w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2',
          'rounded-[var(--radius-card)] border border-border-subtle bg-surface-raised shadow-modal',
          'max-h-[85vh] overflow-y-auto',
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border-subtle px-5 py-3.5">
          <div>
            <DialogPrimitive.Title className="text-sm font-semibold text-text">{title}</DialogPrimitive.Title>
            {description && (
              <DialogPrimitive.Description className="mt-0.5 text-xs text-text-muted">
                {description}
              </DialogPrimitive.Description>
            )}
          </div>
          <DialogPrimitive.Close
            aria-label={t('action.close')}
            className="rounded p-1 text-text-subtle transition-colors hover:bg-surface-hover hover:text-text"
          >
            <X className="size-4" />
          </DialogPrimitive.Close>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer && (
          <div className="flex justify-end gap-2 border-t border-border-subtle px-5 py-3">{footer}</div>
        )}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

/** Slide-over panel. Same primitive as Dialog, different geometry. */
export function SheetContent({
  title,
  description,
  children,
  className,
  side = 'right',
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  side?: 'right' | 'left';
}) {
  const t = useT();
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-zinc-950/50" />
      <DialogPrimitive.Content
        className={cn(
          'fixed inset-y-0 z-50 flex w-[min(22rem,90vw)] flex-col border-border-subtle bg-surface shadow-modal',
          side === 'right' ? 'right-0 border-l' : 'left-0 border-r',
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border-subtle px-4 py-3.5">
          <div>
            <DialogPrimitive.Title className="text-sm font-semibold text-text">{title}</DialogPrimitive.Title>
            {description && (
              <DialogPrimitive.Description className="mt-0.5 text-xs text-text-muted">
                {description}
              </DialogPrimitive.Description>
            )}
          </div>
          <DialogPrimitive.Close
            aria-label={t('action.close')}
            className="rounded p-1 text-text-subtle transition-colors hover:bg-surface-hover hover:text-text"
          >
            <X className="size-4" />
          </DialogPrimitive.Close>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

/* ------------------------------------------------------------------ */
/* Dropdown menu                                                       */
/* ------------------------------------------------------------------ */

export const DropdownMenu = DropdownPrimitive.Root;
export const DropdownTrigger = DropdownPrimitive.Trigger;

export function DropdownContent({
  children,
  align = 'end',
  className,
}: {
  children: React.ReactNode;
  align?: 'start' | 'center' | 'end';
  className?: string;
}) {
  return (
    <DropdownPrimitive.Portal>
      <DropdownPrimitive.Content
        align={align}
        sideOffset={6}
        className={cn(
          'z-50 min-w-44 overflow-hidden rounded-[var(--radius-card)] border border-border-subtle bg-surface-raised p-1 shadow-popover',
          className,
        )}
      >
        {children}
      </DropdownPrimitive.Content>
    </DropdownPrimitive.Portal>
  );
}

export function DropdownItem({
  children,
  onSelect,
  danger,
  disabled,
  className,
  asChild,
}: {
  children: React.ReactNode;
  onSelect?: (e: Event) => void;
  danger?: boolean;
  disabled?: boolean;
  className?: string;
  /** Render the child element instead of a div — use for <Link> items. */
  asChild?: boolean;
}) {
  return (
    <DropdownPrimitive.Item
      asChild={asChild}
      onSelect={onSelect}
      disabled={disabled}
      className={cn(
        'flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-[13px] text-text outline-none select-none',
        'data-[highlighted]:bg-surface-hover data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        danger && 'text-rose-600 dark:text-rose-400',
        className,
      )}
    >
      {children}
    </DropdownPrimitive.Item>
  );
}

export function DropdownLabel({ children }: { children: React.ReactNode }) {
  return <DropdownPrimitive.Label className="px-2 py-1.5 text-[11px] font-medium text-text-subtle">{children}</DropdownPrimitive.Label>;
}

export function DropdownSeparator() {
  return <DropdownPrimitive.Separator className="my-1 h-px bg-border-subtle" />;
}

/* ------------------------------------------------------------------ */
/* Tooltip                                                             */
/* ------------------------------------------------------------------ */

export function TooltipProvider({ children }: { children: React.ReactNode }) {
  return (
    <TooltipPrimitive.Provider delayDuration={250} skipDelayDuration={200}>
      {children}
    </TooltipPrimitive.Provider>
  );
}

export function Tooltip({
  content,
  children,
  side = 'top',
}: {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
}) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          className="z-50 max-w-64 rounded-md border border-border-subtle bg-surface-raised px-2.5 py-1.5 text-xs text-text shadow-popover"
        >
          {content}
          <TooltipPrimitive.Arrow className="fill-[var(--surface-raised)]" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

/* ------------------------------------------------------------------ */
/* Popover                                                             */
/* ------------------------------------------------------------------ */

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverClose = PopoverPrimitive.Close;

export function PopoverContent({
  children,
  align = 'end',
  className,
}: {
  children: React.ReactNode;
  align?: 'start' | 'center' | 'end';
  className?: string;
}) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        align={align}
        sideOffset={8}
        className={cn(
          'z-50 rounded-[var(--radius-card)] border border-border-subtle bg-surface-raised shadow-popover',
          className,
        )}
      >
        {children}
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Portal>
  );
}
