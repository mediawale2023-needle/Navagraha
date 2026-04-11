import React from 'react';
import { Sparkles } from 'lucide-react';

interface GreetingCardProps {
  userName?: string;
  subtitle?: string;
  className?: string;
}

/**
 * Greeting Card Component
 *
 * Personal welcome message at top of home screen.
 * Warm, inviting, not overly dramatic.
 */
export function GreetingCard({
  userName = 'Seeker',
  subtitle = 'How can the stars guide you today?',
  className = '',
}: GreetingCardProps) {
  return (
    <div className={`bg-card border border-border rounded-xl p-4 ${className}`}>
      <h1 className="font-semibold text-foreground text-xl mb-1">
        Namaste, {userName} 🙏
      </h1>
      <p className="text-sm text-muted-foreground">{subtitle}</p>
    </div>
  );
}
