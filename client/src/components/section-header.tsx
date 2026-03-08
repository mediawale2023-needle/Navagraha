import { ChevronRight } from 'lucide-react';
import { Link } from 'wouter';

interface SectionHeaderProps {
    title: string;
    subtitle?: string;
    showViewAll?: boolean;
    viewAllLink?: string;
}

export function SectionHeader({ title, subtitle, showViewAll = true, viewAllLink = "#" }: SectionHeaderProps) {
    return (
        <div className="flex items-center justify-between mb-4 px-1">
            <div>
                <h3 className="font-bold text-lg text-foreground tracking-tight">{title}</h3>
                {subtitle && <p className="text-[11px] text-foreground/50 font-medium mt-0.5">{subtitle}</p>}
            </div>
            {showViewAll && (
                <Link href={viewAllLink}>
                    <button className="text-xs font-semibold text-[var(--teal)] hover:text-foreground transition-colors flex items-center gap-1 focus:outline-none">
                        View All <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                </Link>
            )}
        </div>
    );
}
