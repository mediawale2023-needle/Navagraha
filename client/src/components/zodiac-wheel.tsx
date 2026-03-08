import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Heart, Activity, TrendingUp, Star } from 'lucide-react';
import { LoadingSpinner } from '@/components/LoadingSpinner';

const zodiacSignsArr = [
    { sign: 'aries', name: 'Mesh', emoji: '🐏', bg: 'bg-[var(--teal)]' },
    { sign: 'taurus', name: 'Vrishabh', emoji: '🐂', bg: 'bg-[var(--turmeric)]' },
    { sign: 'gemini', name: 'Mithun', emoji: '👥', bg: 'bg-[var(--magenta)]' },
    { sign: 'cancer', name: 'Kark', emoji: '🦀', bg: 'bg-[var(--teal)]/40' },
    { sign: 'leo', name: 'Simha', emoji: '🦁', bg: 'bg-[var(--teal)]' },
    { sign: 'virgo', name: 'Kanya', emoji: '👩', bg: 'bg-[var(--turmeric)]' },
    { sign: 'libra', name: 'Tula', emoji: '⚖️', bg: 'bg-[var(--magenta)]' },
    { sign: 'scorpio', name: 'Vrishchik', emoji: '🦂', bg: 'bg-[var(--teal)]/40' },
    { sign: 'sagittarius', name: 'Dhanu', emoji: '🏹', bg: 'bg-[var(--teal)]' },
    { sign: 'capricorn', name: 'Makar', emoji: '🐐', bg: 'bg-[var(--turmeric)]' },
    { sign: 'aquarius', name: 'Kumbh', emoji: '🏺', bg: 'bg-[var(--magenta)]' },
    { sign: 'pisces', name: 'Meen', emoji: '🐟', bg: 'bg-[var(--teal)]/40' },
];

export function ZodiacWheel() {
    const [selectedSign, setSelectedSign] = useState('aries');

    const { data: horoscope, isLoading: horoscopeLoading } = useQuery<{ prediction: string }>({
        queryKey: ['/api/horoscope/daily', selectedSign],
    });

    return (
        <div>
            <div className="grid grid-cols-4 gap-2 sm:gap-4 max-w-md mx-auto sm:max-w-none px-4">
                {zodiacSignsArr.map(({ sign, name, emoji, bg }) => (
                    <button
                        key={sign}
                        onClick={() => setSelectedSign(sign)}
                        className={`aspect-square rounded-2xl flex flex-col items-center justify-center gap-1.5 transition-all outline-none ${selectedSign === sign
                                ? 'ring-4 ring-offset-2 ring-offset-background ring-[var(--primary)] scale-105 shadow-xl glow-primary z-10'
                                : 'hover:scale-105 hover:shadow-md'
                            } ${bg}`}
                    >
                        <span className="text-2xl drop-shadow-sm">{emoji}</span>
                        <span className="text-[10px] sm:text-xs font-bold text-foreground/90">{name}</span>
                    </button>
                ))}
            </div>

            <div className="mt-6 px-4">
                {horoscopeLoading ? (
                    <div className="flex justify-center py-8">
                        <LoadingSpinner size="sm" />
                    </div>
                ) : (
                    <div className="glass rounded-3xl p-6 relative overflow-hidden ring-1 ring-foreground/5 inner-glow">
                        <div className="absolute -top-10 -right-10 w-32 h-32 bg-[var(--primary)]/[0.08] rounded-full blur-2xl pointer-events-none" />
                        <h4 className="font-bold text-foreground capitalize mb-3 text-base flex items-center gap-2">
                            <span className="inline-block w-2.5 h-2.5 rounded-full bg-[var(--magenta)]" />
                            {selectedSign} Insights
                        </h4>
                        <p className="text-sm text-foreground/80 leading-relaxed font-medium mb-6">
                            {horoscope?.prediction || "Today brings new opportunities for growth. The cosmic energies encourage you to trust your intuition and embrace positive changes."}
                        </p>
                        <div className="grid grid-cols-3 gap-3">
                            {[
                                { icon: Heart, label: 'Love', stars: 4, color: 'text-[var(--magenta)]' },
                                { icon: TrendingUp, label: 'Career', stars: 3, color: 'text-[var(--turmeric)]' },
                                { icon: Activity, label: 'Health', stars: 4, color: 'text-[var(--teal)]' },
                            ].map(({ icon: Icon, label, stars, color }) => (
                                <div key={label} className="bg-background/40 rounded-2xl p-3 text-center border border-foreground/[0.03]">
                                    <Icon className={`w-4 h-4 ${color} mx-auto mb-2`} />
                                    <p className="text-[11px] font-bold text-foreground/60 mb-2">{label}</p>
                                    <div className="flex gap-0.5 justify-center">
                                        {Array.from({ length: 5 }).map((_, i) => (
                                            <Star key={i} className={`w-2 h-2 ${i < stars ? 'fill-[var(--turmeric)] text-[var(--turmeric)]' : 'text-foreground/10'}`} />
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
