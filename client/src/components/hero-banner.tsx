import { Sparkles } from 'lucide-react';
import { Link } from 'wouter';

export function HeroBanner() {
    return (
        <div className="mb-6">
            <Link href="/astrologers">
                <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-r from-[var(--magenta)] to-pink-500 p-6 sm:p-8 cursor-pointer shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300">
                    {/* Background decorators */}
                    <div className="absolute -left-10 -bottom-10 w-40 h-40 border-[40px] border-white/10 rounded-full" />
                    <div className="absolute -right-6 -bottom-6 w-32 h-32 border-[30px] border-white/10 rounded-full" />

                    <div className="relative z-10 text-center flex flex-col items-center">
                        <div className="flex gap-2 justify-center mb-3">
                            <Sparkles className="w-5 h-5 text-white/80" />
                            <Sparkles className="w-6 h-6 text-white" />
                            <Sparkles className="w-5 h-5 text-white/80" />
                        </div>
                        <h3 className="text-white font-bold text-2xl sm:text-3xl mb-2">First Consultation Free</h3>
                        <p className="text-white/90 text-sm font-medium mb-5">Connect with expert astrologers</p>
                        <button className="bg-[var(--turmeric)] hover:bg-[#E09315] text-foreground font-bold rounded-full px-8 py-3 transition-transform hover:scale-105 shadow-md w-fit focus:outline-none">
                            Talk to Astrologer
                        </button>
                    </div>
                </div>
            </Link>
        </div>
    );
}
