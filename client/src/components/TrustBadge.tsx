import React from 'react';
import { CheckCircle, Calculator, Shield } from 'lucide-react';

interface TrustBadgeProps {
  variant?: 'verified' | 'calculated' | 'secure';
  className?: string;
}

/**
 * Trust Badge Component
 *
 * Displays a small badge that signals authority and trustworthiness.
 * Used on charts, calculations, and sensitive data displays.
 *
 * Design principles:
 * - Green = verified/confirmed
 * - Purple = calculated/processed
 * - Blue = secure/protected
 */
export function TrustBadge({ variant = 'verified', className = '' }: TrustBadgeProps) {
  const variants = {
    verified: {
      icon: CheckCircle,
      text: 'Verified',
      className: 'trust-badge trust-badge-verified',
    },
    calculated: {
      icon: Calculator,
      text: 'Calculated',
      className: 'trust-badge trust-badge-calculated',
    },
    secure: {
      icon: Shield,
      text: 'Secure',
      className: 'trust-badge trust-badge-verified',
    },
  };

  const { icon: Icon, text, className: variantClass } = variants[variant];

  return (
    <span className={`${variantClass} ${className}`}>
      <Icon className="w-3.5 h-3.5" />
      {text}
    </span>
  );
}
