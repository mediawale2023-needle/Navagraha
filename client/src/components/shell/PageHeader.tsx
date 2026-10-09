import { Link } from 'wouter';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { AccountSheetButton } from './AccountMenu';

export interface PageHeaderProps {
  title: ReactNode;
  /** Devanagari gloss, set smaller and muted after the title. */
  gloss?: string;
  /** Line above the title (Eczar, amber), e.g. the date. */
  eyebrow?: ReactNode;
  sub?: ReactNode;
  /** Parent page; mobile shows a back button, desktop a text link. */
  back?: { href: string; label: string };
  /** Page-level actions: right of the title on desktop, under the header on mobile. */
  actions?: ReactNode;
  /** Desktop width class shared with the page body, e.g. "max-w-3xl". */
  width?: string;
  /** The compact header the Ask mockup uses (15px title, 12px sub). */
  compact?: boolean;
}

/**
 * The one page header (Direction 3): a navy header on mobile, a title block under the navy
 * navigation band on desktop. Pages never draw their own header or navigation.
 */
export function PageHeader({ title, gloss, eyebrow, sub, back, actions, width = 'max-w-[1320px]', compact }: PageHeaderProps) {
  return (
    <>
      <header className={cn('flex items-center gap-1.5 bg-ink text-on-navy md:hidden', compact ? 'p-3' : 'px-5 pb-3.5 pt-4')} data-testid="page-header-mobile">
        {back && (
          <Link href={back.href} aria-label={`Back to ${back.label}`} className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber" data-testid="button-back">
            <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="1.8" /></svg>
          </Link>
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          {eyebrow && <p className="font-display text-base text-amber">{eyebrow}</p>}
          <h1 className={cn('m-0 text-balance', compact ? 'text-nav font-semibold' : 'font-display text-heading font-semibold leading-tight')}>
            {title}
            {gloss && <span lang="hi" className={cn('font-normal text-on-navy-3', compact ? 'text-caption' : 'text-base')}> {gloss}</span>}
          </h1>
          {sub && <p className={cn('text-on-navy-3', compact ? 'text-xs' : 'text-caption')}>{sub}</p>}
        </div>
        {!back && <AccountSheetButton />}
      </header>
      {actions && <div className="flex flex-wrap gap-2 px-4 pt-3 md:hidden">{actions}</div>}

      <div className={cn('mx-auto hidden w-full flex-col gap-1.5 px-10 pt-9 md:flex', width)} data-testid="page-header-desktop">
        {back && (
          <Link href={back.href} className="self-start text-sm text-ink-muted hover:text-amber-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            ← {back.label}
          </Link>
        )}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1">
            {eyebrow && <p className="font-display text-card-title text-amber-text">{eyebrow}</p>}
            <h1 className="m-0 font-display text-title font-semibold text-balance text-ink">
              {title}
              {gloss && <span lang="hi" className="text-subhead font-normal text-ink-muted"> {gloss}</span>}
            </h1>
            {sub && <p className="text-sm text-ink-muted">{sub}</p>}
          </div>
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </div>
      </div>
    </>
  );
}

/** The page body under a PageHeader, sharing its width and the 40px desktop gutter. */
export function PageBody({ children, width = 'max-w-[1320px]', className }: { children: ReactNode; width?: string; className?: string }) {
  return <div className={cn('mx-auto w-full px-4 py-4 md:px-10 md:py-8', width, className)}>{children}</div>;
}
