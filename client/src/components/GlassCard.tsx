import { cn } from "@/lib/utils";

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
}

export function GlassCard({ children, className, hover = false }: GlassCardProps) {
  return (
    <div
      className={cn(
        "rounded-lg border border-white/10 bg-white/5 backdrop-blur-md shadow-lg",
        hover && "hover-elevate active-elevate-2 transition-all duration-300 cursor-pointer",
        className
      )}
    >
      {children}
    </div>
  );
}
