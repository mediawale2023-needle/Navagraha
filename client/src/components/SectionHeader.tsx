import React from 'react';
import { ChevronRight } from 'lucide-react';
import { Link } from 'wouter';

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  viewAllLink?: string;
  showViewAll?: boolean;
  className?: string;
}

/**
 * Section Header Component
 *
 * Clean, authoritative section headers.
 * No gradients, no glow effects - just clear typography.
 */
export function SectionHeader({
  title,
  subtitle,
  viewAllLink,
  showViewAll = true,
  className = '',
}: SectionHeaderProps) {
  return (
    <div className={`flex items-center justify-between mb-4 ${className}`}>
      <div>
        <h2 className="font-display text-[1.15rem] text-foreground">
          {title}
        </h2>
        {subtitle && (
          <p className="mt-1 text-sm text-muted-foreground">
            {subtitle}
          </p>
        )}
      </div>
      {showViewAll && viewAllLink && (
        <Link
          href={viewAllLink}
          className="flex items-center gap-1 border-b border-foreground pb-0.5 text-sm font-semibold text-foreground"
        >
          View All
          <ChevronRight className="w-4 h-4" />
        </Link>
      )}
    </div>
  );
}
