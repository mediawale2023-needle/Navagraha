import { Sparkles } from 'lucide-react';
import { Link } from 'wouter';

export function HeroBanner() {
    return (
        <div className="mb-6">
            <Link href="/astrologers">
                <div className="relative overflow-hidden rounded-3xl bg-nava-magenta p-6 cursor-pointer shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300">
                    {/* Background decorative circles */}
                    <div className="absolute -left-8 top-1/2 -translate-y-1/2 w-24 h-24 border-[20px] border-white/10 rounded-full" />
                    <div className="absolute -right-6 -bottom-6 w-28 h-28 border-[24px] border-white/10 rounded-full" />

                    <div className="relative z-10 text-center flex flex-col items-center">
                        {/* Sparkle icons */}
                        <div className="flex gap-2 justify-center mb-3">
                            <Sparkles className="w-4 h-4 text-white/70" />
                            <Sparkles className="w-5 h-5 text-white" />
                            <Sparkles className="w-4 h-4 text-white/70" />
                        </div>
                        
                        <h3 className="text-white font-bold text-xl sm:text-2xl mb-2">First Consultation Free</h3>
                        <p className="text-white/90 text-sm font-medium mb-4">Connect with expert astrologers</p>
                        
                        <button className="bg-nava-amber hover:bg-nava-amber/90 text-nava-navy font-bold rounded-full px-6 py-2.5 transition-all hover:scale-105 shadow-md">
                            Talk to Astrologer
                        </button>
                    </div>
                </div>
            </Link>
        </div>
    );
}
