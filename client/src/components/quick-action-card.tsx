import { LucideIcon } from 'lucide-react';

interface QuickActionCardProps {
    title: string;
    icon: LucideIcon;
    color: 'teal' | 'magenta' | 'yellow' | 'navy';
    onClick?: () => void;
}

export function QuickActionCard({ title, icon: Icon, color, onClick }: QuickActionCardProps) {
    const colorMap = {
        teal: 'bg-[var(--teal)] text-white',
        magenta: 'bg-[var(--magenta)] text-white',
        yellow: 'bg-[var(--turmeric)] text-foreground',
        navy: 'bg-[var(--foreground)] text-white'
    };

    return (
        <div
            onClick={onClick}
            className={`rounded-3xl p-5 flex flex-col items-center justify-center text-center cursor-pointer hover:opacity-90 transition-opacity ${colorMap[color]} min-h-[140px] relative overflow-hidden group`}
        >
            {/* Decorative subtle shape */}
            <div className="absolute top-0 right-0 w-16 h-16 bg-white/5 rounded-bl-[100px]" />

            <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                <Icon className="w-5 h-5 inherit-text" />
            </div>
            <span className="text-sm font-bold leading-tight inherit-text">
                {title}
            </span>
        </div>
    );
}
