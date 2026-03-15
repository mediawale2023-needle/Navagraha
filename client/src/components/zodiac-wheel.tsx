import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Heart, Activity, TrendingUp, Star } from 'lucide-react';
import { LoadingSpinner } from '@/components/LoadingSpinner';

const zodiacSignsArr = [
    { sign: 'aries', name: 'Mesh', emoji: '🐏', bg: 'bg-nava-amber' },
    { sign: 'taurus', name: 'Vrishabh', emoji: '🐂', bg: 'bg-nava-teal' },
    { sign: 'gemini', name: 'Mithun', emoji: '👥', bg: 'bg-nava-magenta' },
    { sign: 'cancer', name: 'Kark', emoji: '🦀', bg: 'bg-nava-aqua' },
    { sign: 'leo', name: 'Simha', emoji: '🦁', bg: 'bg-nava-amber' },
    { sign: 'virgo', name: 'Kanya', emoji: '👩', bg: 'bg-nava-teal' },
    { sign: 'libra', name: 'Tula', emoji: '⚖️', bg: 'bg-nava-magenta' },
    { sign: 'scorpio', name: 'Vrishchik', emoji: '🦂', bg: 'bg-nava-aqua' },
    { sign: 'sagittarius', name: 'Dhanu', emoji: '🏹', bg: 'bg-nava-teal' },
    { sign: 'capricorn', name: 'Makar', emoji: '🐐', bg: 'bg-nava-amber' },
    { sign: 'aquarius', name: 'Kumbh', emoji: '🏺', bg: 'bg-nava-magenta' },
    { sign: 'pisces', name: 'Meen', emoji: '🐟', bg: 'bg-nava-aqua' },
];

export function ZodiacWheel() {
    const [selectedSign, setSelectedSign] = useState('aries');

    const { data: horoscope, isLoading: horoscopeLoading } = useQuery<{ prediction: string }>({
        queryKey: ['/api/horoscope/daily', selectedSign],
    });

    return (
        <div>
            {/* Zodiac Grid - 4 columns */}
            <div className="grid grid-cols-4 gap-3 px-4">
                {zodiacSignsArr.map(({ sign, name, emoji, bg }) => (
                    <button
                        key={sign}
                        onClick={() => setSelectedSign(sign)}
                        className={`aspect-square rounded-2xl flex flex-col items-center justify-center gap-1 transition-all outline-none ${bg} ${
                            selectedSign === sign
                                ? 'ring-3 ring-offset-2 ring-offset-background ring-nava-navy scale-105 shadow-lg'
                                : 'hover:scale-105 hover:shadow-md'
                        }`}
                    >
                        <span className="text-2xl sm:text-3xl drop-shadow-sm">{emoji}</span>
                        <span className="text-[10px] sm:text-xs font-bold text-white">{name}</span>
                    </button>
                ))}
            </div>

            {/* Horoscope Content */}
            <div className="mt-6 px-4">
                {horoscopeLoading ? (
                    <div className="flex justify-center py-8">
                        <LoadingSpinner size="sm" />
                    </div>
                ) : (
                    <div className="bg-card rounded-3xl p-5 shadow-sm border border-border/50">
                        <h4 className="font-bold text-foreground capitalize mb-3 text-base flex items-center gap-2">
                            <span className="inline-block w-2 h-2 rounded-full bg-nava-magenta" />
                            {selectedSign} Insights
                        </h4>
                        <p className="text-sm text-muted-foreground leading-relaxed mb-5">
                            {horoscope?.prediction || "Today brings new opportunities for growth. The cosmic energies encourage you to trust your intuition and embrace positive changes."}
                        </p>
                        <div className="grid grid-cols-3 gap-3">
                            {[
                                { icon: Heart, label: 'Love', stars: 4, color: 'text-nava-magenta' },
                                { icon: TrendingUp, label: 'Career', stars: 3, color: 'text-nava-amber' },
                                { icon: Activity, label: 'Health', stars: 4, color: 'text-nava-teal' },
                            ].map(({ icon: Icon, label, stars, color }) => (
                                <div key={label} className="bg-background rounded-xl p-3 text-center">
                                    <Icon className={`w-4 h-4 ${color} mx-auto mb-2`} />
                                    <p className="text-[10px] font-semibold text-muted-foreground mb-2">{label}</p>
                                    <div className="flex gap-0.5 justify-center">
                                        {Array.from({ length: 5 }).map((_, i) => (
                                            <Star key={i} className={`w-2.5 h-2.5 ${i < stars ? 'fill-nava-amber text-nava-amber' : 'text-border'}`} />
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
