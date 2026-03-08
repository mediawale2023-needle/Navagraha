import { Star } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Link } from 'wouter';

interface AstrologerCardProps {
    id?: number | string;
    name: string;
    image: string;
    rating: number;
    experience: number;
    price: number;
    specialization: string;
    isOnline: boolean;
}

export function AstrologerCard({
    id = 1, name, image, rating, experience, price, specialization, isOnline
}: AstrologerCardProps) {
    return (
        <Link href={`/astrologers/${id}`}>
            <div className="w-[180px] shrink-0 astronex-card p-4 pt-10 flex flex-col items-center text-center relative cursor-pointer group hover:-translate-y-1 transition-all">
                {/* Decorative faint top borders */}
                <div className="absolute top-0 left-0 w-8 h-8 rounded-tl-xl border-t border-l border-foreground/[0.05]" />
                <div className="absolute top-0 right-0 w-8 h-8 rounded-tr-xl border-t border-r border-foreground/[0.05]" />

                {/* Avatar overlapping top border */}
                <div className="absolute -top-7 left-1/2 -translate-x-1/2">
                    <div className="relative">
                        <Avatar className="w-16 h-16 border-4 border-background shadow-sm">
                            <AvatarImage src={image} className="object-cover" />
                            <AvatarFallback className="bg-[var(--foreground)] text-white font-bold text-xl">
                                {name.charAt(0)}
                            </AvatarFallback>
                        </Avatar>
                        {isOnline && (
                            <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 bg-emerald-500 text-white text-[9px] font-bold px-2 py-0.5 rounded-full border-2 border-background flex items-center gap-1 shadow-sm whitespace-nowrap z-10">
                                <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                                Online
                            </div>
                        )}
                    </div>
                </div>

                <h4 className="font-bold text-sm text-foreground mb-1 mt-2 line-clamp-1 group-hover:text-[var(--primary)] transition-colors">{name}</h4>
                <p className="text-[10px] text-[var(--teal)] font-medium mb-2 line-clamp-1">
                    {specialization}
                </p>
                <div className="flex items-center gap-2 text-[10px] text-foreground/50 font-medium w-full justify-center">
                    <span className="flex items-center gap-0.5">
                        <Star className="w-2.5 h-2.5 fill-[var(--turmeric)] text-[var(--turmeric)]" />
                        {rating}
                    </span>
                    <span className="text-foreground/15">&bull;</span>
                    <span>{experience} years exp</span>
                </div>
            </div>
        </Link>
    );
}
