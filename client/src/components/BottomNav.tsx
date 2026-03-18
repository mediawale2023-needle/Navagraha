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
    path: "/ai-astrologer",
    isCenter: true,
    icon: (_active: boolean) => (
      <div className="w-14 h-14 rounded-full bg-nava-magenta flex items-center justify-center -mt-7 shadow-lg ring-4 ring-background">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
          <circle cx="12" cy="12" r="3" fill="#FFFFFF" stroke="none" />
        </svg>
      </div>
    ),
  },
  {
    label: "Horoscope",
    path: "/horoscope",
    icon: (active: boolean) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="5" />
        <line x1="12" y1="1" x2="12" y2="3" />
        <line x1="12" y1="21" x2="12" y2="23" />
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
        <line x1="1" y1="12" x2="3" y2="12" />
        <line x1="21" y1="12" x2="23" y2="12" />
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
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
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-nava-cream/95 backdrop-blur-md border-t border-border/30 z-50 pb-safe">
      <div className="flex items-center justify-around h-16 px-2">
        {NAV_ITEMS.map((item, i) => {
          const isActive = location === item.path;
          return (
            <button
              key={i}
              onClick={() => setLocation(item.path)}
              className={`flex flex-col items-center justify-center gap-0.5 transition-all duration-200 ${
                item.isCenter
                  ? "relative"
                  : `min-w-[56px] py-1 ${isActive ? "text-nava-teal" : "text-muted-foreground hover:text-foreground"}`
              }`}
            >
              {item.icon(isActive)}
              {item.label && (
                <span
                  className={`text-[10px] font-semibold transition-colors ${
                    isActive ? "text-nava-teal" : "text-muted-foreground"
                  }`}
                >
                  {item.label}
                </span>
              )}
              {isActive && !item.isCenter && (
                <div className="absolute -top-0.5 w-5 h-0.5 rounded-full bg-nava-teal" />
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
