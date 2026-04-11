import { useLocation } from "wouter";

const NAV_ITEMS = [
  {
    label: "Home",
    path: "/",
    icon: (active: boolean) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    ),
  },
  {
    label: "Charts",
    path: "/kundli/new",
    icon: (active: boolean) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <circle cx="12" cy="12" r="4" />
        <line x1="12" y1="2" x2="12" y2="6" />
        <line x1="12" y1="18" x2="12" y2="22" />
        <line x1="2" y1="12" x2="6" y2="12" />
        <line x1="18" y1="12" x2="22" y2="12" />
      </svg>
    ),
  },
  {
    label: "",
    path: "/astrologers",
    isCenter: true,
    icon: (_active: boolean) => (
      <div className="w-14 h-14 rounded-full bg-nava-royal-purple flex items-center justify-center -mt-7 shadow-lg ring-4 ring-background">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      </div>
    ),
  },
  {
    label: "Remedies",
    path: "/remedies",
    icon: (active: boolean) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2L2 7l10 5 10-5-10-5z" />
        <path d="M2 17l10 5 10-5" />
        <path d="M2 12l10 5 10-5" />
      </svg>
    ),
  },
  {
    label: "Profile",
    path: "/profile",
    icon: (active: boolean) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
  },
];

export default function BottomNav() {
  const [location, setLocation] = useLocation();

  return (
    <nav className="md:hidden fixed bottom-6 left-4 right-4 rounded-2xl bg-white/95 backdrop-blur-xl z-50 overflow-hidden shadow-lg border border-border pb-safe">
      <div className="flex items-center justify-around h-16 px-2 relative">
        {NAV_ITEMS.map((item, i) => {
          const isActive = location === item.path;
          return (
            <button
              key={i}
              onClick={() => setLocation(item.path)}
              className={`flex flex-col items-center justify-center gap-0.5 transition-all duration-200 ${
                item.isCenter
                  ? "relative"
                  : `min-w-[56px] py-1 ${isActive ? "text-nava-royal-purple" : "text-muted-foreground hover:text-foreground"}`
              }`}
            >
              {item.icon(isActive)}
              {item.label && (
                <span
                  className={`text-[10px] font-semibold transition-colors ${
                    isActive ? "text-nava-royal-purple" : "text-muted-foreground"
                  }`}
                >
                  {item.label}
                </span>
              )}
              {isActive && !item.isCenter && (
                <div className="absolute -top-0.5 w-5 h-0.5 rounded-full bg-nava-royal-purple" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

// Named export for backward compatibility with existing page imports
export { BottomNav };
