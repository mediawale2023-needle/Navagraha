import { Star, Phone, MessageCircle } from 'lucide-react';
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
        <div className="w-[280px] shrink-0 glass-card rounded-3xl p-4 pt-12 flex flex-col items-center text-center relative">
            {/* Decorative corner accents */}
            <div className="absolute top-3 left-3 w-6 h-6 border-t-2 border-l-2 border-nava-teal/20 rounded-tl-lg" />
            <div className="absolute top-3 right-3 w-6 h-6 border-t-2 border-r-2 border-nava-teal/20 rounded-tr-lg" />

            {/* Avatar overlapping top */}
            <div className="absolute -top-8 left-1/2 -translate-x-1/2">
                <div className="relative">
                    <div className="w-20 h-20 rounded-full p-1 bg-gradient-to-br from-nava-teal/30 to-nava-amber/30">
                        <Avatar className="w-full h-full border-3 border-card shadow-md">
                            <AvatarImage src={image} className="object-cover" />
                            <AvatarFallback className="bg-nava-navy text-white font-bold text-xl">
                                {name.charAt(0)}
                            </AvatarFallback>
                        </Avatar>
                    </div>
                    {isOnline && (
                        <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 bg-emerald-500 text-white text-[10px] font-semibold px-3 py-1 rounded-full border-2 border-card flex items-center gap-1.5 shadow-sm whitespace-nowrap z-10">
                            <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                            Online
                        </div>
                    )}
                </div>
            </div>

            {/* Name */}
            <h4 className="font-bold text-base text-foreground mb-1 mt-2">{name}</h4>
            
            {/* Specialization */}
            <p className="text-xs text-nava-teal font-medium mb-2">
                {specialization}
            </p>
            
            {/* Rating & Experience */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium mb-3">
                <span className="flex items-center gap-1">
                    <Star className="w-3.5 h-3.5 fill-nava-amber text-nava-amber" />
                    {rating}
                </span>
                <span className="text-border">|</span>
                <span>{experience} years exp</span>
            </div>
            
            {/* Price */}
            <div className="mb-4">
                <span className="text-nava-teal font-bold text-lg">₹{price}</span>
                <span className="text-muted-foreground text-sm">/min</span>
            </div>
            
            {/* Action Buttons */}
            <div className="flex gap-2 w-full">
                <Link href={`/astrologers/${id}?action=call`} className="flex-1">
                    <button className="w-full bg-nava-teal hover:bg-nava-teal/90 text-white font-semibold rounded-full py-2.5 px-4 flex items-center justify-center gap-2 transition-all">
                        <Phone className="w-4 h-4" />
                        Call
                    </button>
                </Link>
                <Link href={`/astrologers/${id}?action=chat`} className="flex-1">
                    <button className="w-full bg-nava-navy hover:bg-nava-navy/90 text-white font-semibold rounded-full py-2.5 px-4 flex items-center justify-center gap-2 transition-all">
                        <MessageCircle className="w-4 h-4" />
                        Chat
                    </button>
                </Link>
            </div>
        </div>
    );
}
