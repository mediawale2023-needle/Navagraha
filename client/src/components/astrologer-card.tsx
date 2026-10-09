import { Star, Phone, MessageCircle } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Link } from 'wouter';
import { ratingLabel, experienceLabel, priceLabel } from '@/lib/astrologerDisplay';

interface AstrologerCardProps {
    id?: number | string;
    name: string;
    image: string;
    rating?: string | number | null;
    experience?: string | number | null;
    price?: string | number | null;
    specialization: string;
    isVerified?: boolean;
    isOnline: boolean;
}

export function AstrologerCard({
    id, name, image, rating, experience, price, specialization, isVerified, isOnline
}: AstrologerCardProps) {
    return (
        <div className="yantra-card w-[288px] shrink-0 p-4">
            <div className="flex items-center gap-3">
                <div className="relative shrink-0">
                    <Avatar className="h-14 w-14 rounded-[6px] border border-border">
                        <AvatarImage src={image} className="object-cover" />
                        <AvatarFallback className="bg-ink font-display text-base text-primary">
                            {name.charAt(0)}
                        </AvatarFallback>
                    </Avatar>
                    {isOnline && <span className="absolute -bottom-1 -right-1 h-3 w-3 bg-green-600 ring-2 ring-background" />}
                </div>
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <h4 className="font-display truncate text-base text-foreground">{name}</h4>
                        {isVerified && <span className="bg-ink px-1.5 py-0.5 text-xs font-bold tracking-[0.12em] text-primary">VERIFIED</span>}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{specialization}</p>
                    <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                            <Star className="h-3.5 w-3.5 fill-primary text-primary" />
                            {ratingLabel(rating)}
                        </span>
                        {experienceLabel(experience) && <span>{experienceLabel(experience)}</span>}
                    </div>
                </div>
                {priceLabel(price) && (
                    <div className="text-right">
                        <div className="font-display text-lg text-[var(--primary-border)]">{priceLabel(price)}</div>
                        <div className="text-xs uppercase tracking-[0.12em] text-muted-foreground">per min</div>
                    </div>
                )}
            </div>
            <div className="mt-4 flex gap-2">
                <Link href={`/call/${id}?type=voice`} className="flex-1">
                    <button className="w-full rounded-[9px] bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground">
                        <Phone className="mr-2 inline h-4 w-4" />
                        Call
                    </button>
                </Link>
                <Link href={`/chat/${id}`} className="flex-1">
                    <button className="w-full rounded-[9px] bg-ink px-4 py-2.5 text-sm font-semibold text-primary">
                        <MessageCircle className="mr-2 inline h-4 w-4" />
                        Chat
                    </button>
                </Link>
            </div>
        </div>
    );
}
