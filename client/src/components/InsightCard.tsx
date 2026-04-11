import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Sparkles } from 'lucide-react';

interface InsightCardProps {
  title: string;
  preview: string;
  fullContent: string;
  icon?: React.ReactNode;
  priority?: 'high' | 'medium' | 'low';
  onExpand?: () => void;
}

/**
 * Insight Card Component
 *
 * Expandable card for displaying chart insights.
 * Shows a brief preview by default, expands to full explanation.
 *
 * Design:
 * - Clean white card with subtle border
 * - Icon on left (planet/house symbol)
 * - Priority indicator (color-coded)
 * - Smooth expand animation
 */
export function InsightCard({
  title,
  preview,
  fullContent,
  icon,
  priority = 'medium',
  onExpand,
}: InsightCardProps) {
  const [expanded, setExpanded] = useState(false);

  const priorityColors = {
    high: 'border-l-nava-burgundy border-l-4',
    medium: 'border-l-nava-royal-purple border-l-4',
    low: 'border-l-nava-deep-green border-l-4',
  };

  const priorityLabels = {
    high: 'High Priority',
    medium: 'Key Insight',
    low: 'Notable',
  };

  const handleExpand = () => {
    setExpanded(!expanded);
    onExpand?.();
  };

  return (
    <div
      className={`bg-card border border-border rounded-xl p-4 transition-all duration-200 hover:shadow-md ${priorityColors[priority]}`}
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className="w-10 h-10 rounded-full bg-nava-lavender flex items-center justify-center flex-shrink-0">
          {icon || <Sparkles className="w-5 h-5 text-nava-royal-purple" />}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="font-semibold text-foreground text-base">
                {title}
              </h3>
              <span
                className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                  priority === 'high'
                    ? 'bg-red-50 text-red-700'
                    : priority === 'medium'
                    ? 'bg-nava-lavender text-nava-royal-purple'
                    : 'bg-green-50 text-green-700'
                }`}
              >
                {priorityLabels[priority]}
              </span>
            </div>
            <button
              onClick={handleExpand}
              className="p-1 rounded-lg hover:bg-muted transition-colors flex-shrink-0"
              aria-label={expanded ? 'Collapse' : 'Expand'}
            >
              {expanded ? (
                <ChevronUp className="w-4 h-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              )}
            </button>
          </div>

          <div className="mt-3">
            <p className="text-foreground text-sm leading-relaxed">
              {expanded ? fullContent : preview}
            </p>
          </div>

          {expanded && (
            <div className="mt-4 pt-4 border-t border-border">
              <h4 className="font-semibold text-foreground text-sm mb-2">
                What This Means:
              </h4>
              <p className="text-muted-foreground text-sm leading-relaxed">
                {fullContent}
              </p>
              <button
                onClick={() => setExpanded(false)}
                className="mt-3 text-nava-royal-purple text-sm font-medium hover:underline"
              >
                Show Less
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
