import React from 'react';
import { X, Sparkles, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetClose,
} from '@/components/ui/sheet';

interface AIInsightSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  planetName: string;
  houseNumber: number;
  signName: string;
  baseInsight: string;
  onAskQuestion?: (question: string) => void;
}

/**
 * AI Insight Bottom Sheet Component
 *
 * Contextual AI explanations for chart elements.
 * Triggered by tapping a planet/house in the chart.
 *
 * Features:
 * - Pre-written base insight
 * - Suggested follow-up questions
 * - Open-ended question input
 * - Trust indicators (citations, confidence)
 */
export function AIInsightSheet({
  open,
  onOpenChange,
  planetName,
  houseNumber,
  signName,
  baseInsight,
  onAskQuestion,
}: AIInsightSheetProps) {
  const suggestedQuestions = [
    `How does ${planetName} affect my career?`,
    `What about relationships?`,
    `Any remedies for this placement?`,
    `What during Saturn return?`,
  ];

  const handleQuestionClick = (question: string) => {
    onAskQuestion?.(question);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="h-[60vh] sm:h-[500px] bg-card border-t border-border"
      >
        <SheetHeader className="mb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-nava-lavender flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-nava-royal-purple" />
              </div>
              <div>
                <SheetTitle className="text-left">
                  {planetName} in {getHouseNameSuffix(houseNumber)} House
                </SheetTitle>
                <SheetDescription className="text-left">
                  in {signName}
                </SheetDescription>
              </div>
            </div>
            <SheetClose className="rounded-lg hover:bg-muted p-2">
              <X className="w-5 h-5 text-muted-foreground" />
            </SheetClose>
          </div>
        </SheetHeader>

        {/* Base Insight */}
        <div className="overflow-y-auto h-full pb-20">
          <div className="bg-nava-lavender/50 rounded-xl p-4 mb-4 border border-nava-royal-purple/20">
            <p className="text-foreground leading-relaxed">{baseInsight}</p>
          </div>

          {/* Confidence Indicator */}
          <div className="flex items-center gap-2 mb-4 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-nava-royal-purple" />
              Based on 3 strong indicators
            </span>
            <span>•</span>
            <span>Brihat Parashara Hora Shastra, Chapter 32</span>
          </div>

          {/* Suggested Questions */}
          <div className="mb-4">
            <p className="text-sm font-medium text-foreground mb-3">
              Ask about:
            </p>
            <div className="flex flex-wrap gap-2">
              {suggestedQuestions.map((question, index) => (
                <Button
                  key={index}
                  variant="outline"
                  size="sm"
                  onClick={() => handleQuestionClick(question)}
                  className="text-xs min-h-8 bg-card hover:bg-nava-lavender/50 hover:border-nava-royal-purple/30"
                >
                  <MessageCircle className="w-3.5 h-3.5 mr-1" />
                  {question}
                </Button>
              ))}
            </div>
          </div>

          {/* Custom Question Input */}
          <div className="border-t border-border pt-4">
            <p className="text-sm font-medium text-foreground mb-3">
              Or ask anything:
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Type your question..."
                className="flex-1 min-h-9 px-3 rounded-md border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-nava-royal-purple"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                    handleQuestionClick(e.currentTarget.value);
                    e.currentTarget.value = '';
                  }
                }}
              />
              <Button
                size="sm"
                className="bg-nava-royal-purple hover:bg-nava-royal-purple/90 min-h-9"
              >
                Ask
              </Button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function getHouseNameSuffix(house: number): string {
  const suffixes = ['', 'st', 'nd', 'rd', 'th', 'th', 'th', 'th', 'th', 'th', 'th', 'th', 'th'];
  return `${house}${suffixes[house] || 'th'}`;
}
