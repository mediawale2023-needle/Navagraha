interface PatternProps {
    className?: string;
}

export function MandalaBg({ className = '' }: PatternProps) {
    return (
        <div className={`celestial-mesh opacity-20 pointer-events-none ${className}`} />
    );
}

export function TextilePattern({ className = '' }: PatternProps) {
    return (
        <div className={`pointer-events-none ${className}`}>
            <div className="fixed top-0 left-0 w-[45vw] h-[45vw] rounded-full bg-[var(--rose)]/[0.04] blur-[100px]" />
            <div className="fixed bottom-0 right-0 w-[45vw] h-[45vw] rounded-full bg-[var(--gold)]/[0.03] blur-[100px]" />
        </div>
    );
}
