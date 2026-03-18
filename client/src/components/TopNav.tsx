import { Link, useLocation } from "wouter";
import { Sparkles, Wallet, User } from "lucide-react";

const NAV_LINKS = [
  { label: "Home", path: "/" },
  { label: "Charts", path: "/kundli/new" },
  { label: "AI Astrologer", path: "/ai-astrologer" },
  { label: "Horoscope", path: "/horoscope" },
  { label: "Astrologers", path: "/astrologers" },
];

export default function TopNav() {
  const [location] = useLocation();

  return (
    <nav className="hidden md:flex sticky top-0 z-50 bg-background/95 backdrop-blur-md border-b border-border/30 items-center justify-between px-8 lg:px-12 h-14">
      {/* Brand */}
      <div className="flex items-center gap-2 shrink-0">
        <span className="font-bold text-lg text-foreground">Navagraha</span>
        <div className="flex items-center gap-1 text-nava-teal text-xs font-medium">
          <Sparkles className="w-3 h-3 fill-nava-amber text-nava-amber" />
          <span>Nine Celestial Powers</span>
        </div>
      </div>

      {/* Nav Links */}
      <div className="flex items-center gap-1">
        {NAV_LINKS.map((item) => (
          <Link key={item.path} href={item.path}>
            <span
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                location === item.path
                  ? "bg-nava-teal/10 text-nava-teal"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              {item.label}
            </span>
          </Link>
        ))}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 shrink-0">
        <Link href="/wallet">
          <span className="flex items-center gap-1.5 bg-card rounded-full px-3 py-1.5 hover:bg-card/80 transition-colors shadow-sm border border-border/50 text-xs font-bold text-foreground cursor-pointer">
            <Wallet className="w-3.5 h-3.5 text-nava-amber" />
            Wallet
          </span>
        </Link>
        <Link href="/profile">
          <span className="w-9 h-9 rounded-full bg-nava-amber/20 flex items-center justify-center hover:bg-nava-amber/30 transition-colors cursor-pointer">
            <User className="w-4 h-4 text-nava-amber" />
          </span>
        </Link>
      </div>
    </nav>
  );
}
