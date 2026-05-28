import { Link, useLocation } from "wouter";
import { Sparkles, Wallet, User } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const NAV_LINKS = [
  { label: "Home", path: "/" },
  { label: "Live", path: "/live" },
  { label: "Astrologers", path: "/astrologers" },
  { label: "Astromall", path: "/store" },
  { label: "Reports", path: "/reports" },
  { label: "Pooja", path: "/pooja" },
  { label: "Charts", path: "/kundli" },
];

export default function TopNav() {
  const [location] = useLocation();

  return (
    <nav className="sticky top-0 z-50 hidden h-16 items-center justify-between border-b border-border bg-background/95 px-8 backdrop-blur-md md:flex lg:px-12">
      {/* Brand */}
      <div className="flex items-center gap-2 shrink-0">
        <span className="font-display text-lg text-foreground">Navagraha</span>
        <div className="flex items-center gap-1 text-xs font-medium text-[var(--primary-border)]">
          <Sparkles className="w-3 h-3" />
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
                  ? "bg-nava-navy text-primary"
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
        {/* Profile Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex h-9 w-9 items-center justify-center rounded-[8px] border border-border bg-card transition-colors hover:bg-muted">
              <User className="w-4 h-4 text-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48 bg-card border-border">
            <Link href="/profile">
              <DropdownMenuItem className="cursor-pointer">
                <User className="w-4 h-4 mr-2" />
                My Profile
              </DropdownMenuItem>
            </Link>
            <Link href="/wallet">
              <DropdownMenuItem className="cursor-pointer">
                <Wallet className="w-4 h-4 mr-2" />
                Wallet
              </DropdownMenuItem>
            </Link>
            <DropdownMenuSeparator className="bg-border" />
            <DropdownMenuItem
              className="text-nava-burgundy cursor-pointer"
              onClick={() => (window.location.href = '/api/logout')}
            >
              Log Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Wallet Button - Desktop */}
        <Link href="/wallet">
          <span className="hidden cursor-pointer items-center gap-1.5 rounded-[9px] bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm transition-colors hover:opacity-90 lg:flex">
            <Wallet className="w-3.5 h-3.5" />
            Wallet
          </span>
        </Link>
      </div>
    </nav>
  );
}
