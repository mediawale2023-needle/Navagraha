import { LucideIcon } from 'lucide-react';

interface QuickActionCardProps {
    title: string;
    icon: LucideIcon;
    color: 'teal' | 'magenta' | 'amber' | 'navy';
    onClick?: () => void;
}

export function QuickActionCard({ title, icon: Icon, color, onClick }: QuickActionCardProps) {
    const colorMap = {
        teal: 'bg-nava-teal',
        magenta: 'bg-nava-magenta',
        amber: 'bg-nava-amber',
        navy: 'bg-nava-navy'
    };

    return (
        <div
            onClick={onClick}
            className={`rounded-2xl p-4 flex flex-col items-center justify-center text-center cursor-pointer hover:opacity-90 hover:scale-[1.02] transition-all ${colorMap[color]} min-h-[120px] relative overflow-hidden shadow-sm`}
        >
            {/* Decorative subtle corner shape */}
            <div className="absolute top-0 right-0 w-12 h-12 bg-white/10 rounded-bl-[40px]" />

            <div className="w-11 h-11 rounded-full bg-white/20 flex items-center justify-center mb-2">
                <Icon className="w-5 h-5 text-white" />
            </div>
            <span className="text-sm font-semibold leading-tight text-white">
                {title}
            </span>
        </div>
    );
}
