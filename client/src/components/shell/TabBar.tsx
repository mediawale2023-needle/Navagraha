import { Link, useLocation, useSearch } from 'wouter';
import type { ReactNode } from 'react';
import { PRIMARY_NAV, activeNav, type NavId } from './navigation';

// Inline stroke icons from the Direction 3 mockups: 22px, 1.6 stroke (1.2 for the inner chart lines).
const ICONS: Partial<Record<NavId, ReactNode>> = {
  today: <><circle cx="12" cy="12" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke="currentColor" strokeWidth="1.6" /></>,
  kundli: <><rect x="3" y="3" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M3 3l18 18M21 3L3 21M12 3l9 9-9 9-9-9z" fill="none" stroke="currentColor" strokeWidth="1.2" /></>,
  ask: <path d="M4 5h16v11H9l-5 4z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />,
  dasha: <path d="M3 12h18M7 8v8M13 6v12M18 9v6" fill="none" stroke="currentColor" strokeWidth="1.6" />,
};

/** Direction 3 mobile navigation: four tabs on a navy bar. */
export function TabBar() {
  const [path] = useLocation();
  const active = activeNav(path, useSearch());
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-navy-line bg-ink px-1 pt-1.5 pb-[max(18px,env(safe-area-inset-bottom))] md:hidden"
      data-testid="tab-bar"
    >
      {PRIMARY_NAV.filter((i) => i.tab).map((item) => {
        const current = active === item.id;
        return (
          <Link
            key={item.id}
            href={item.href}
            aria-current={current ? 'page' : undefined}
            className={`flex min-h-12 flex-col items-center justify-center gap-[3px] text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber ${current ? 'font-semibold text-amber' : 'text-on-navy-2'}`}
            data-testid={`tab-${item.id}`}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">{ICONS[item.id]}</svg>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
