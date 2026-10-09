import React from 'react';
import { ArrowRight, Sparkles } from 'lucide-react';
import { Link } from 'wouter';

interface HeroBannerProps {
  title?: string;
  subtitle?: string;
  cta?: string;
  href?: string;
  /** Optional small label above the title; omitted by default so it cannot contradict CMS copy. */
  eyebrow?: string;
  className?: string;
}

/**
 * Hero Banner Component
 *
 * Top banner for promotions or key messages.
 * Subtle spiritual gradient, not cosmic/neon.
 */
export function HeroBanner({
  title = 'Your Cosmic Blueprint Awaits',
  subtitle = 'Discover what the stars have planned for you',
  cta = 'Generate Your Kundli',
  href = '/kundli/new',
  eyebrow,
  className = '',
}: HeroBannerProps) {
  return (
    <Link href={href} className="block rounded-[12px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2">
      <div
        className={`gradient-spiritual relative overflow-hidden rounded-[12px] border border-[var(--primary-border)] p-6 transition-all duration-200 hover:shadow-md ${className}`}
      >
        <svg
          aria-hidden="true"
          className="absolute -right-8 -top-8 h-40 w-40 opacity-25"
          viewBox="0 0 160 160"
          fill="none"
        >
          <rect x="10" y="10" width="140" height="140" transform="rotate(45 80 80)" stroke="currentColor" strokeWidth="1.4" />
          <rect x="32" y="32" width="96" height="96" transform="rotate(45 80 80)" stroke="currentColor" strokeWidth="1.4" />
          <circle cx="80" cy="80" r="18" stroke="currentColor" strokeWidth="1.4" />
          <circle cx="80" cy="80" r="3.8" fill="currentColor" />
        </svg>
        <div className="relative max-w-[70%] text-ink">
          {eyebrow && <p className="yantra-eyebrow text-ink/80">{eyebrow}</p>}
          <h2 className="font-display mt-2 text-[1.65rem] leading-[1.12] text-ink">
            {title}
          </h2>
          <p className="mt-2 text-sm text-ink/80">{subtitle}</p>
          <span className="mt-4 inline-flex items-center gap-2 rounded-[9px] bg-ink px-4 py-2 text-sm font-semibold text-primary" data-testid="hero-banner-cta">
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            {cta}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </span>
        </div>
      </div>
    </Link>
  );
}
