import { ChevronRight } from 'lucide-react';
import { Link } from 'wouter';

interface RemedyCardProps {
    title: string;
    image: string;
    price: string;
}

export function RemedyCard({ title, image, price }: RemedyCardProps) {
    return (
        <Link href={`/store/category/${title.toLowerCase().replace(' ', '-')}`}>
            <div className="w-[160px] shrink-0 flex flex-col items-center group cursor-pointer focus:outline-none">
                {/* Arched Image Container */}
                <div className="w-full h-40 rounded-t-full rounded-b-xl overflow-hidden mb-3 ring-4 ring-background shadow-md relative group-hover:-translate-y-1 group-hover:shadow-lg transition-all duration-300">
                    <img
                        src={image}
                        alt={title}
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                    />
                    <div className="absolute inset-x-0 bottom-2 flex justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="w-1.5 h-1.5 rounded-full bg-[var(--turmeric)]" />
                        <div className="w-1.5 h-1.5 rounded-full bg-[var(--teal)]" />
                        <div className="w-1.5 h-1.5 rounded-full bg-[var(--magenta)]" />
                    </div>
                </div>

                <h4 className="font-bold text-sm text-foreground text-center mb-0.5">{title}</h4>
                <p className="text-[11px] font-semibold text-[var(--teal)]">
                    From {price} <ChevronRight className="w-3 h-3 inline -mt-0.5" />
                </p>
            </div>
        </Link>
    );
}
