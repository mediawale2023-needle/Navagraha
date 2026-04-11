import React from 'react';
import { CheckCircle, Clock, Bell, BellOff } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface PriorityRemedyCardProps {
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'consult';
  timeRequired: string;
  bestTime?: string;
  itemsNeeded?: string[];
  isCompleted?: boolean;
  hasReminder?: boolean;
  onToggleReminder?: () => void;
  onComplete?: () => void;
  onViewDetails?: () => void;
}

/**
 * Priority Remedy Card Component
 *
 * Displays a remedy with clear priority, time commitment, and action items.
 * Designed to be actionable, not overwhelming.
 *
 * Features:
 * - Priority stars (★★★ High, ★★ Medium, ★ Consult)
 * - Time estimate
 * - Best timing recommendation
 * - Items needed checklist
 * - Reminder toggle
 * - Completion tracking
 */
export function PriorityRemedyCard({
  title,
  description,
  priority,
  timeRequired,
  bestTime,
  itemsNeeded,
  isCompleted = false,
  hasReminder = false,
  onToggleReminder,
  onComplete,
  onViewDetails,
}: PriorityRemedyCardProps) {
  const priorityConfig = {
    high: {
      stars: '★★★',
      label: 'High Priority',
      color: 'text-red-700',
      bgColor: 'bg-red-50',
      borderColor: 'border-red-200',
    },
    medium: {
      stars: '★★☆',
      label: 'Medium Priority',
      color: 'text-orange-700',
      bgColor: 'bg-orange-50',
      borderColor: 'border-orange-200',
    },
    consult: {
      stars: '☆☆☆',
      label: 'Consult Astrologer',
      color: 'text-nava-royal-purple',
      bgColor: 'bg-nava-lavender',
      borderColor: 'border-nava-royal-purple/20',
    },
  };

  const config = priorityConfig[priority];

  return (
    <div
      className={`bg-card border ${config.borderColor} rounded-xl p-4 transition-all duration-200 hover:shadow-md ${
        isCompleted ? 'opacity-75' : ''
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-xs font-bold ${config.color}`}>
              {config.stars}
            </span>
            <span className={`text-xs font-medium ${config.color}`}>
              {config.label}
            </span>
          </div>
          <h3
            className={`font-semibold text-foreground ${
              isCompleted ? 'line-through text-muted-foreground' : ''
            }`}
          >
            {title}
          </h3>
        </div>
        {isCompleted && (
          <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
        )}
      </div>

      {/* Description */}
      <p className="text-muted-foreground text-sm mb-4">{description}</p>

      {/* Meta Info */}
      <div className="flex flex-wrap gap-3 mb-4 text-xs">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Clock className="w-3.5 h-3.5" />
          <span>{timeRequired}</span>
        </div>
        {bestTime && (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Bell className="w-3.5 h-3.5" />
            <span>Best: {bestTime}</span>
          </div>
        )}
      </div>

      {/* Items Needed */}
      {itemsNeeded && itemsNeeded.length > 0 && (
        <div className={`${config.bgColor} rounded-lg p-3 mb-4`}>
          <p className="text-xs font-medium text-foreground mb-2">
            Items Needed:
          </p>
          <ul className="text-xs text-muted-foreground space-y-1">
            {itemsNeeded.map((item, index) => (
              <li key={index}>• {item}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onViewDetails}
          className="flex-1 text-xs min-h-8"
        >
          View Full Procedure
        </Button>
        {onToggleReminder && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleReminder}
            className={`min-h-8 ${
              hasReminder
                ? 'text-nava-royal-purple bg-nava-lavender'
                : 'text-muted-foreground'
            }`}
          >
            {hasReminder ? (
              <Bell className="w-4 h-4" />
            ) : (
              <BellOff className="w-4 h-4" />
            )}
          </Button>
        )}
        {onComplete && (
          <Button
            size="sm"
            onClick={onComplete}
            className={`min-h-8 ${
              isCompleted
                ? 'bg-green-600 hover:bg-green-700'
                : 'bg-nava-royal-purple hover:bg-nava-royal-purple/90'
            }`}
          >
            {isCompleted ? 'Completed' : 'Mark Done'}
          </Button>
        )}
      </div>
    </div>
  );
}
