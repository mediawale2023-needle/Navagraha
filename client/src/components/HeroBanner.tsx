import React from 'react';
import { ArrowRight, Sparkles } from 'lucide-react';
import { Link } from 'wouter';

interface HeroBannerProps {
  title?: string;
  subtitle?: string;
  cta?: string;
  href?: string;
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
  className = '',
}: HeroBannerProps) {
  return (
    <Link href={href}>
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
        <div className="relative max-w-[70%] text-[var(--nava-navy)]">
          <p className="yantra-eyebrow text-[var(--nava-navy)]/80">पहली चर्चा मुफ़्त · First chat free</p>
          <h2 className="font-display mt-2 text-[1.65rem] leading-[1.12] text-[var(--nava-navy)]">
            {title}
          </h2>
          <p className="mt-2 text-sm text-[var(--nava-navy)]/80">{subtitle}</p>
          <span className="mt-4 inline-flex items-center gap-2 rounded-[9px] bg-[var(--nava-navy)] px-4 py-2 text-sm font-semibold text-primary-foreground">
            <Sparkles className="h-4 w-4" />
            {cta}
            <ArrowRight className="h-4 w-4" />
          </span>
        </div>
      </div>
    </Link>
  );
}
