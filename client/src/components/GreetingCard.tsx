import React from 'react';

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
    <div className={`yantra-card p-5 ${className}`}>
      <p className="yantra-eyebrow">नमस्ते · Today&apos;s reading</p>
      <h1 className="font-display mt-3 text-[1.95rem] leading-[1.05] text-foreground">
        {userName},<br />
        the stars are listening.
      </h1>
      <p className="mt-3 max-w-xl text-sm text-muted-foreground">{subtitle}</p>
    </div>
  );
}
