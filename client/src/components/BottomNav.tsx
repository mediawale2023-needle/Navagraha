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
    path: "/kundli",
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
      <div className="flex h-14 w-14 -mt-7 items-center justify-center rounded-[6px] bg-primary shadow-lg ring-4 ring-nava-navy">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#1A1A2E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-nava-navy bg-nava-navy pb-safe md:hidden" data-testid="bottom-nav">
      <div className="relative flex h-[74px] items-center justify-around px-2">
        {NAV_ITEMS.map((item, i) => {
          const isActive = location === item.path;
          return (
            <button
              key={i}
              onClick={() => setLocation(item.path)}
              className={`flex flex-col items-center justify-center gap-0.5 transition-all duration-200 ${
                item.isCenter
                  ? "relative"
                  : `min-w-[56px] py-1 ${isActive ? "text-primary" : "text-white/55 hover:text-white"}`
              }`}
            >
              {item.icon(isActive)}
              {item.label && (
                <span
                  className={`text-[10px] font-semibold transition-colors ${
                    isActive ? "text-primary" : "text-white/55"
                  }`}
                >
                  {item.label}
                </span>
              )}
              {isActive && !item.isCenter && (
                <div className="absolute top-0 h-0.5 w-5 rounded-full bg-primary" />
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
