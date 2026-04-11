import React from 'react';
import { Sparkles } from 'lucide-react';
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
        className={`gradient-spiritual rounded-xl p-5 border border-nava-royal-purple/20 transition-all duration-200 hover:shadow-md ${className}`}
      >
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-nava-royal-purple flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1">
            <h2 className="font-semibold text-foreground text-lg mb-1">
              {title}
            </h2>
            <p className="text-sm text-muted-foreground mb-3">{subtitle}</p>
            <span className="inline-flex items-center text-nava-royal-purple text-sm font-medium hover:underline">
              {cta}
              <svg
                className="w-4 h-4 ml-1"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
