import { Link, useLocation } from "wouter";
import { Sparkles, Wallet, User, Sun, Moon } from "lucide-react";
import { useTheme } from "@/components/ThemeProvider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const NAV_LINKS = [
  { label: "Home", path: "/" },
  { label: "Charts", path: "/kundli/new" },
  { label: "AI Astrologer", path: "/chat/ai-astrologer" },
  { label: "Horoscope", path: "/horoscope" },
  { label: "Astrologers", path: "/astrologers" },
];

export default function TopNav() {
  const [location] = useLocation();
  const { theme, setTheme } = useTheme();

  return (
    <nav className="hidden md:flex sticky top-0 z-50 bg-background/95 backdrop-blur-md border-b border-border items-center justify-between px-8 lg:px-12 h-16">
      {/* Brand */}
      <div className="flex items-center gap-2 shrink-0">
        <span className="font-semibold text-lg text-foreground">Navagraha</span>
        <div className="flex items-center gap-1 text-nava-royal-purple text-xs font-medium">
          <Sparkles className="w-3 h-3" />
          <span>Ancient Wisdom, Clear Guidance</span>
        </div>
      </div>

      {/* Nav Links */}
      <div className="flex items-center gap-1">
        {NAV_LINKS.map((item) => (
          <Link key={item.path} href={item.path}>
            <span
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                location === item.path
                  ? "bg-nava-lavender text-nava-royal-purple"
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
        {/* Theme Toggle */}
        <button
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="w-9 h-9 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors"
          aria-label="Toggle theme"
        >
          {theme === "dark" ? (
            <Sun className="w-4 h-4 text-nava-burnt-orange" />
          ) : (
            <Moon className="w-4 h-4 text-nava-royal-purple" />
          )}
        </button>

        {/* Profile Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="w-9 h-9 rounded-full bg-nava-lavender flex items-center justify-center hover:bg-nava-lavender/80 transition-colors">
              <User className="w-4 h-4 text-nava-royal-purple" />
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
          <span className="hidden lg:flex items-center gap-1.5 bg-nava-royal-purple rounded-full px-3 py-1.5 hover:bg-nava-royal-purple/90 transition-colors shadow-sm text-xs font-semibold text-white cursor-pointer">
            <Wallet className="w-3.5 h-3.5" />
            Wallet
          </span>
        </Link>
      </div>
    </nav>
  );
}
