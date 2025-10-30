import { Sparkles } from 'lucide-react';

interface ZodiacIconProps {
  sign: string;
  className?: string;
}

const zodiacSymbols: Record<string, string> = {
  aries: '♈',
  taurus: '♉',
  gemini: '♊',
  cancer: '♋',
  leo: '♌',
  virgo: '♍',
  libra: '♎',
  scorpio: '♏',
  sagittarius: '♐',
  capricorn: '♑',
  aquarius: '♒',
  pisces: '♓',
};

export function ZodiacIcon({ sign, className = '' }: ZodiacIconProps) {
  const symbol = zodiacSymbols[sign.toLowerCase()];

  if (!symbol) {
    return <Sparkles className={className} />;
  }

  return (
    <span className={`font-serif text-accent ${className}`} style={{ fontSize: '1.5em' }}>
      {symbol}
    </span>
  );
}
